var path = require('path'),
    assert = require('assert'),
    vows = require('vows');

require.paths.unshift(path.join(__dirname, '..', 'lib'));

var transformjs = require('transformjs');

// *************************************************************************************************

vows.describe('basics').addBatch({
    'tests': {
        'declaration': function() {
            var source = 'var a = 1, b = 10;';

            var ast = transformjs.transform(source, [
                function(node, next) {
                    if (node.type == 'num' && node.value > 5) {
                        return {type: 'num', value: 5};
                    }
                    return next();
                }
            ]);

            var output = transformjs.generate(ast);
            assert.equal(output, 'var a=1,b=5');
        },

        'replace number': function() {
            var source = 'a = 1 + 10;';

            var ast = transformjs.transform(source, [
                function(node, next) {
                    if (node.type == 'num' && node.value > 5) {
                        return {type: 'num', value: 5};
                    }
                    return next();
                }
            ]);

            var output = transformjs.generate(ast);
            assert.equal(output, 'a=1+5');
        },

        'strips else': function() {
            var source = 'if (1) { a(); } else { b(); }';

            var ast = transformjs.transform(source, [
                function(node, next) {
                    if (node.type == 'if') {
                        return next(node.ifBlock);
                    }
                    return next();
                }
            ]);

            var output = transformjs.generate(ast);
            assert.equal(output, '{a()}');
        },

        'nested strip': function() {
            var source = 'if (has("foo")) { a() } else if (has("bar")) { b() } else { c() }';

            var ast = transformjs.transform(source, [
                function(node, next) {
                    if (node.type == 'if') {
                        var cond = node.condition;
                        if (cond.type == 'call') {
                            if (cond.left.type == 'name' && cond.left.name == 'has') {
                                var args = cond.args;
                                if (args.length == 1) {
                                    var featureNode = args[0];
                                    if (featureNode.type == 'string') {
                                        var feature = featureNode.value;
                                        if (feature == 'bar') {
                                            return next(node.ifBlock);
                                        } else {
                                            return next(node.elseBlock);
                                        }
                                    }
                                }
                            }
                        }
                    }
                    return next();
                }
            ]);

            var output = transformjs.generate(ast);
            assert.equal(output, '{b()}');
        },
        
        'syntax error': function() {
            
        }   
    }
}).export(module);
