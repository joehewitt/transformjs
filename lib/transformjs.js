
var dandy = require('dandy');
var uglify = require('uglify-js');

var typeMap = {
    'num': ['value', LITERAL],
    'string': ['value', LITERAL],
    'regexp': ['value', LITERAL, 'flags', LITERAL],
    'array': ['items', ARRAY],
    'object': ['items', PAIRS],
    'name': ['name', LITERAL],
    'stat': ['expr', NODE],
    'block': ['statements', ARRAY],
    'var': ['decls', DECLS],
    'decl': ['left', LITERAL, 'right', NODE],
    'pair': ['left', LITERAL, 'right', NODE],
    'assign': ['um', LITERAL, 'left', NODE, 'right', NODE],
    'unary-prefix': ['op', LITERAL, 'expr', NODE],
    'unary-postfix': ['op', LITERAL, 'expr', NODE],
    'binary': ['op', LITERAL, 'left', NODE, 'right', NODE],
    'conditional': ['condition', NODE, 'ifBlock', NODE, 'elseBlock', NODE],
    'call': ['left', NODE, 'args', ARRAY],
    'new': ['expr', NODE, 'args', ARRAY],
    'dot': ['left', NODE, 'right', LITERAL],
    'sub': ['left', NODE, 'right', NODE],
    'defun': ['name', LITERAL, 'args', LITERAL, 'block', ARRAY],
    'function': ['name', LITERAL, 'args', LITERAL, 'block', ARRAY],
    'return': ['expr', NODE],
    'continue': [],
    'break': [],
    'if': ['condition', NODE, 'ifBlock', NODE, 'elseBlock', NODE],
    'for-in': ['iter', NODE, 'left', NODE, 'right', NODE, 'block', NODE],
    'for': ['init', NODE, 'condition', NODE, 'increment', NODE, 'block', NODE],
    'while': ['condition', NODE, 'block', NODE],
    'try': ['try', ARRAY, 'catch', CATCH, 'finally', ARRAY],
    'switch': ['expr', NODE, 'cases', CASES],
    'label': ['name', LITERAL],
};

// *************************************************************************************************

/**
 * Traverses JavaScript AST, calling filters for each node.
 *
 * source - JavaScript source
 * filters - array of functions like `function(node, next) {}`
 */
exports.transform = function(source, filters) {
    // Parse into Uglify's AST of nested arrays or treat source as an existing AST
    var ast = typeof(source) == 'string' ? uglify.parser.parse(source) : source;
    // logDeep(ast[1]);

    if (filters && filters.length) {
        // Convert Uglify's AST into a nicer object hierarchy
        var nodes = arraysToNodes(ast[1]);
        // logDeep(nodes);

        // Traverse hierarchy, calling filters for each node
        nodes = visit(nodes);
        // logDeep(nodes);

        // Convert AST back to Uglify's format
        ast[1] = nodesToArrays(nodes);
        // logDeep(ast[1]);
    }

    return ast;

    function visit(node) {
        if (!node) {
            return node;
        } else if (node instanceof Array) {
            var newNodes = [];
            for (var i = 0; i < node.length; ++i) {
                var newNode = visit(node[i]);
                if (newNode) {
                    newNodes.push(newNode);
                }
            }
            return newNodes;
        } else {
            var fns = filters ? filters.slice() : [];
            fns.push(function(n) {
                return walkNode(n, visit);
            });

            function next(n) {
                if (n) {
                    return visit(n);
                } else if (fns.length) {
                    return fns.shift()(node, next);
                }
            }

            return next();          
        }
    }
}

/** 
 * Generates JavaScript source from the AST returned by transform().
 */
exports.generate = function(ast, minify, beautify) {
    var pro = uglify.uglify;
    if (minify) {
        ast = pro.ast_mangle(ast, {toplevel: true});
        ast = pro.ast_squeeze(ast);
    }
    return pro.gen_code(ast, {beautify: beautify});
}

// *************************************************************************************************

function LITERAL(val, from) {
    return val;
}

function NODE(val, from) {
    if (from) {
        return arrayToNode(val);
    } else {
        return nodeToArray(val);
    }
}

function ARRAY(val, from) {
    if (from) {
        return arraysToNodes(val);
    } else {
        return nodesToArrays(val);
    }
}

function CATCH(val, from) {
    if (from) {
        return {type: 'catch', name: val[0], block: arraysToNodes(val[1])};
    } else {
        return [val.name, nodesToArrays(val.block)];
    }
}

function DECLS(val, from) {
    if (from) {
        return arraysToNodes(val, 'decl');
    } else {
        return nodesToArrays(val, 'decl');
    }
}


function PAIRS(val, from) {
    if (from) {
        return arraysToNodes(val, 'pair');
    } else {
        return nodesToArrays(val, 'pair');
    }
}

function CASES(val, from) {
    if (from) {
        return casesToNodes(val, 'pair');
    } else {
        return nodesToCases(val, 'pair');
    }
}

// *************************************************************************************************

function arraysToNodes(statements, declType, isCase) {
    if (!statements) {
        return [];
    }

    var nodes = [];

    for (var i = 0; i < statements.length; ++i) {
        var statement = statements[i];
        var newNode = arrayToNode(declType ? statement[1] : statement);
        if (declType) {
            newNode = {type: declType, left: statement[0], right: newNode};
        }
        if (newNode) {
            nodes.push(newNode);
        }
    }

    return nodes;
}

function casesToNodes(statements) {
    var nodes = [];
    for (var i = 0; i < statements.length; ++i) {
        var statement = statements[i];
        var caseNode = arrayToNode(statement[0]);
        var blockNode = arraysToNodes(statement[1]);
        var newNode = {type: 'case', 'condition': caseNode, block: blockNode};
        nodes.push(newNode);
    }
    return nodes;
}

function nodesToCases(nodes, declType) {
    var arrays = [];
    for (var i = 0; i < nodes.length; ++i) {
        var node = nodes[i];
        var arrCondition = nodeToArray(node.condition);
        var arrBlock = nodesToArrays(node.block);
        var arr = [arrCondition, arrBlock];
        arrays.push(arr);           
    }
    return arrays;
}

function arrayToNode(arr) {
    if (!arr) {
        return null;
    }
    var map = typeMap[arr[0]];
    if (map) {
        var node = {type: arr[0]};
        for (var i = 0; i < map.length; i += 2) {
            var name = map[i];
            var fn = map[i+1];
            var obj = arr[(i/2)+1];
            if (obj !== undefined) {
                node[name] = fn(obj, true);
            }
        }
        return node;
    } else {
        return {type: arr[0], original: arr};
    }
}

function nodesToArrays(nodes, declType) {
    if (!nodes) {
        return null;
    }
    var arrays = [];
    for (var i = 0; i < nodes.length; ++i) {
        var node = nodes[i];
        if (declType) {
            var arr = nodeToArray(node.right);
            arrays.push([node.left, arr]);          
        } else {
            var arr = nodeToArray(node);
            arrays.push(arr);           
        }
    }
    return arrays;
}

function nodeToArray(node) {
    if (!node) {
        return null;
    }
    var map = typeMap[node.type];
    if (map) {
        var arr = [node.type];
        for (var i = 0; i < map.length; i += 2) {
            var name = map[i];
            var fn = map[i+1];
            var obj = node[name];
            var objArr = fn(obj);
            arr.push(objArr);
        }
        return arr;
    } else {
        return node.original;
    }
}

function walkNode(node, visit) {
    var map = typeMap[node.type];
    if (map) {
        for (var i = 0; i < map.length; i += 2) {
            var name = map[i];
            var fn = map[i+1];
            var obj = node[name];
            if (fn == NODE) {
                node[name] = visit(obj);
            } else if (fn == ARRAY || fn == DECLS || fn == PAIRS) {
                node[name] = visit(obj);
            }
        }
    }
    return node;
}

function logDeep(obj) {
    console.log(require('util').inspect(obj, null, 200));
}
