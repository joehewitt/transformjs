
var dandy = require('dandy');

var uglify = require('uglify-js'),
    AST_Null = uglify.AST_Null,
    AST_EmptyStatement = uglify.AST_EmptyStatement,
    AST_Statement = uglify.AST_Statement;

// *************************************************************************************************

/**
 * Traverses JavaScript AST, calling filters for each node.
 *
 * source - JavaScript source
 * filters - array of functions like `function(node, next) {}`
 */
exports.transform = function(source, filters) {
    // Parse into Uglify's AST of nested arrays or treat source as an existing AST
    var ast = typeof(source) == 'string' ? uglify.parse(source) : source;
    // logDeep(ast);

    if (filters && filters.length) {
        return walkTree(ast, function(node, descend) {
            var fns = filters ? filters.slice() : [];
            return nextFilter(node);

            function nextFilter(n) {
                if (!n) {
                    n = node;
                }

                var fn = fns.shift();
                if (fns.length) {
                    return fn(n, nextFilter);
                } else {
                    return fn(n, descend);                    
                }
            }
        });
    } else {
        return ast;
    }
}

/** 
 * Generates JavaScript source from the AST returned by transform().
 */
exports.generate = function(ast, minify, beautify) {
    ast.figure_out_scope();

    if (minify) {
        var compressor = uglify.Compressor({warnings: false});
        ast = ast.transform(compressor);

        ast.figure_out_scope();
        ast.compute_char_frequency();
        ast.mangle_names();
    }

    var stream = uglify.OutputStream({beautify: beautify});
    ast.print(stream);
    return stream.toString(); 
}

exports.branchRemover = function(test) {
    return function(node, next) {
        if (node.TYPE == 'If') {
            return branch(evalTest(node.condition), node.body, node.alternative);
        } else if (node.TYPE == 'Conditional') {
            return branch(evalTest(node.condition), node.consequent, node.alternative);
        } else {
            return next();            
        }

        function evalTest(node) {
            var result = test(node);
            if (result) {
                return result;
            } else {
                return evalNode(node);
            }
        }

        function evalNode(node) {
            if (node.TYPE == 'If') {
                return evalIf(node);
            } else if (node.TYPE == 'Conditional') {
                return evalConditional(node);
            } else if (node.TYPE == 'Binary') {
                return evalLogic(node);
            } else if (node.TYPE == 'UnaryPrefix') {
                return evalUnary(node);
            } else if (node.TYPE == 'True') {
                return 'pass';
            } else if (node.TYPE == 'False') {
                return 'fail';
            } else if (node.TYPE == 'Number') {
                return node.value ? 'pass' : 'fail';
            } else {
                return 'next';
            }
        }

        function evalIf(conditionNode) {
            var condition = evalTest(conditionNode.condition);
            if (condition == 'pass' || condition == 'fail') {
                return condition == 'pass'
                    ? evalNode(conditionNode.body)
                    : evalNode(conditionNode.alternative);
            } else {
                return 'next';
            }
        }

        function evalConditional(conditionNode) {
            var condition = evalTest(conditionNode.condition);
            if (condition == 'pass') {
                return evalNode(conditionNode.consequent);
            } else if (condition == 'fail') {
                return evalNode(conditionNode.alternative);
            } else {
                return 'next';
            }
        }

        function evalUnary(unaryNode) {
            if (unaryNode.operator == '!') {
                var expr = evalTest(unaryNode.expression);
                if (expr != 'next') {
                    return expr == 'pass' ? 'fail' : 'pass';
                }
            }
            return 'next';
        }

        function evalLogic(binaryNode) {
            var left = evalTest(binaryNode.left);
            var right = evalTest(binaryNode.right);
            if (left != 'next' && right != 'next') {
                if (binaryNode.operator == '&&') {
                    return left == 'pass' && right == 'pass' ? 'pass' : 'fail';
                } else if (binaryNode.operator == '||') {
                    return left == 'pass' || right == 'pass' ? 'pass' : 'fail';
                }
            }
            return 'next';
        }

        function branch(result, body, alternative) {
            if (result == 'pass') {
                return next(body || exports.EmptyStatement());
            } else if (result == 'fail') {
                return next(alternative || exports.EmptyStatement());
            } else {
                return next();
            }
        }

        function state(result) {
            if (result == 'pass' || result == 'fail') {
                return next(exports.EmptyStatement());
            } else {
                return next();
            }
        }
    };
}

exports.Null = function() {
    return new AST_Null();
};

exports.EmptyStatement = function() {
    return new AST_EmptyStatement();
}

// *************************************************************************************************

var nodeWalkers = {
    Nada: function(node, walk) {
    },
    SimpleStatement: function(node, walk) {
        node.body = walk(node.body);
    },
    Block: function(node, walk) {
        node.body = walkBody(node.body, walk);
    },
    StatementWithBody: function(node, walk) {
        node.body = walkBody(node.body, walk);
    },
    LabeledStatement: function(node, walk) {
        node.label = walk(node.label);
        node.body = walkBody(node.body, walk);
    },
    DWLoop: function(node, walk) {
        node.condition = walk(node.condition);
        node.body = walkBody(node.body, walk);
    },
    For: function(node, walk) {
        if (node.init) node.init = walk(node.init);
        if (node.condition) node.condition = walk(node.condition)
        if (node.step) node.step = walk(node.step);
        node.body = walkBody(node.body, walk);
    },
    ForIn: function(node, walk) {
        node.init = walk(node.init);
        node.object = walk(node.object);
        node.body = walkBody(node.body, walk);
    },
    With: function(node, walk) {
        node.expression = walk(node.expression);
        node.body = walkBody(node.body, walk);
    },
    Lambda: function(node, walk) {
        node.argnames = walkArray(node.argnames, walk)
        node.body = walkBody(node.body, walk);
    },
    Exit: function(node, walk) {
        if (node.value) node.value = walk(node.value);
    },
    LoopControl: function(node, walk) {
        if (node.label) node.label = walk(node.label);
    },
    If: function(node, walk) {
        node.condition = walk(node.condition);
        node.body = walkBody(node.body, walk);
        if (node.alternative) node.alternative = walk(node.alternative);
    },
    Switch: function(node, walk) {
        node.expression = walk(node.expression);
        node.body = walkBody(node.body, walk);
    },
    Case: function(node, walk) {
        node.expression = walk(node.expression);
        node.body = walkBody(node.body, walk);
    },
    Try: function(node, walk) {
        node.body = walkBody(node.body, walk);
        if (node.bcatch) node.bcatch = walk(node.bcatch);
        if (node.bfinally) node.bfinally = walk(node.bfinally);
    },
    Catch: function(node, walk) {
        node.argname = walk(node.argname, walk)
        node.body = walkBody(node.body, walk);
    },
    Definitions: function(node, walk) {
        node.definitions = walkArray(node.definitions, walk);
    },
    VarDef: function(node, walk) {
        node.name = walk(node.name);
        if (node.value) node.value = walk(node.value);
    },
    Call: function(node, walk) {
        node.expression = walk(node.expression);
        node.args = walkArray(node.args, walk);
    },
    Seq: function(node, walk) {
        node.car = walk(node.car);
        if (node.cdr) node.cdr = walk(node.cdr);
    },
    Dot: function(node, walk) {
        node.expression = walk(node.expression);
    },
    Sub: function(node, walk) {
        node.expression = walk(node.expression);
        node.property = walk(node.property);
    },
    Unary: function(node, walk) {
        node.expression = walk(node.expression);
    },
    Binary: function(node, walk) {
        node.left = walk(node.left);
        node.right = walk(node.right);
    },
    Conditional: function(node, walk) {
        node.condition = walk(node.condition);
        node.consequent = walk(node.consequent);
        node.alternative = walk(node.alternative);
    },
    Array: function(node, walk) {
        node.elements = walkArray(node.elements, walk);
    },
    Object: function(node, walk) {
        node.properties = walkArray(node.properties, walk);
    },
    ObjectProperty: function(node, walk) {
        node.value = walk(node.value);
    },
};
nodeWalkers.BlockStatement = nodeWalkers.Block;
nodeWalkers.EmptyStatement = nodeWalkers.Nada;
nodeWalkers.Do = nodeWalkers.DWLoop;
nodeWalkers.While = nodeWalkers.DWLoop;
nodeWalkers.Scope = nodeWalkers.Block;
nodeWalkers.Toplevel = nodeWalkers.Scope;
nodeWalkers.Accessor = nodeWalkers.Lambda;
nodeWalkers.Function = nodeWalkers.Lambda;
nodeWalkers.Defun = nodeWalkers.Lambda;
nodeWalkers.Jump = nodeWalkers.Statement;
nodeWalkers.Return = nodeWalkers.Exit;
nodeWalkers.Throw = nodeWalkers.Exit;
nodeWalkers.Break = nodeWalkers.LoopControl;
nodeWalkers.Continue = nodeWalkers.LoopControl;
nodeWalkers.SwitchBranch = nodeWalkers.Block;
nodeWalkers.Default = nodeWalkers.SwitchBranch;
nodeWalkers.Finally = nodeWalkers.Block;
nodeWalkers.Var = nodeWalkers.Definitions;
nodeWalkers.Const = nodeWalkers.Definitions;
nodeWalkers.New = nodeWalkers.Call;
nodeWalkers.UnaryPrefix = nodeWalkers.Unary;
nodeWalkers.UnaryPostfix = nodeWalkers.Unary;
nodeWalkers.Assign = nodeWalkers.Binary;
nodeWalkers.ObjectKeyVal = nodeWalkers.ObjectProperty;
nodeWalkers.ObjectSetter = nodeWalkers.ObjectProperty;
nodeWalkers.ObjectGetter = nodeWalkers.ObjectProperty;

// *************************************************************************************************

function walkTree(node, visitor) {
    return subwalk(node);

    function subwalk(node) {
        // D&&D('walk', node.TYPE);
        return visitor(node, function(outNode) {
            if (outNode) {
                outNode = subwalk(outNode);
            }
            if (!outNode) {
                outNode = node;
            }
            if (outNode) {
                var descend = nodeWalkers[outNode.TYPE];
                if (descend) {
                    descend(outNode, subwalk);
                } 
                return outNode;
            } else {
                return exports.EmptyStatement();
            }
        });
    }
}

function walkArray(arr, walk) {
    var newArr = [];
    for (var i = 0, l = arr ? arr.length : 0; i < l; ++i) {
        newArr[i] = walk(arr[i]);
    }
    return newArr;
}

function walkBody(body, walk) {
    if (body instanceof AST_Statement) {
        return walk(body);
    } else {
        return walkArray(body, walk);
    }
}

function logDeep(obj) {
    console.log(require('util').inspect(obj, null, 100));
}
