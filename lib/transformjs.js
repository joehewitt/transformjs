
var dandy = require('dandy');
var uglify = require('uglify-js');

/**
 * Traverses JavaScript AST, calling filters for each node.
 *
 * source - JavaScript source
 * filters - array of functions like `function(node, next) {}`
 */
exports.transform = function(source, filters) {
    // Parse into Uglify's AST of nested arrays
    var ast = uglify.parser.parse(source);
    // logDeep(ast[1]);

    // Convert Uglify's AST into a nicer object hierarchy
    var nodes = arraysToNodes(ast[1]);
    // logDeep(nodes);

    // Traverse hierarchy, calling filters for each node
    nodes = visit(nodes);
    // logDeep(nodes);

    // Convert AST back to Uglify's format
    ast[1] = nodesToArrays(nodes);
    // logDeep(ast[1]);

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
exports.generate = function(ast, minify) {
    var pro = uglify.uglify;
    if (minify) {
        ast = pro.ast_mangle(ast, {toplevel: true});
        ast = pro.ast_squeeze(ast);
    }
    return pro.gen_code(ast, {beautify: false});
}

// *************************************************************************************************

var typeMap = {
    num: ['value', LITERAL],
    string: ['value', LITERAL],
    name: ['name', LITERAL],
    'if': ['condition', NODE, 'ifBlock', NODE, 'elseBlock', NODE],
    'call': ['left', NODE, 'args', ARRAY],
    'var': ['decls', DECLS],
    'binary': ['op', LITERAL, 'left', NODE, 'right', NODE],
    'assign': ['um', LITERAL, 'left', NODE, 'right', NODE],
    'decl': ['left', LITERAL, 'right', NODE],
    block: ['statements', ARRAY],
    stat: ['expr', NODE],
};

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

function DECLS(val, from) {
    if (from) {
        return arraysToNodes(val, true);
    } else {
        return nodesToArrays(val, true);
    }
}

// *************************************************************************************************

function arraysToNodes(statements, isDecl) {
    var nodes = [];
    for (var i = 0; i < statements.length; ++i) {
        var statement = statements[i];
        var newNode = arrayToNode(isDecl ? statement[1] : statement);
        if (isDecl) {
            newNode = {type: 'decl', left: statement[0], right: newNode};
        }
        if (newNode) {
            nodes.push(newNode);
        }
    }
    return nodes;
}


function arrayToNode(arr) {
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

function nodesToArrays(nodes, isDecl) {
    var arrays = [];
    for (var i = 0; i < nodes.length; ++i) {
        var node = nodes[i];
        if (isDecl) {
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

function walkNodes(nodes, visit) {
    var newNodes = [];
    for (var i = 0; i < nodes.length; ++i) {
        var newNode = visit(nodes[i]);
        if (newNode) {
            newNodes.push(newNode);
        }
    }
    return newNodes;
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
            } else if (fn == ARRAY || fn == DECLS) {
                node[name] = visit(obj);
            }
        }
    }
    return node;
}

function logDeep(obj) {
    console.log(require('util').inspect(obj, null, 200));
}
