var path = require('path'),
    assert = require('assert'),
    vows = require('vows');

var transformjs = require('transformjs');
var uglify = require('uglify-js');

// *************************************************************************************************

vows.describe('basics').addBatch({
    'tests': {
        'declaration': function() {
            var source = 'var a = 1, b = 10;';

            var ast = transformjs.transform(source, [
                function(node, next) {
                    if (node.TYPE == 'Number' && node.getValue() > 5) {
                        return new uglify.AST_Number({value: 5});
                    } else {
                        return next();                        
                    }
                }
            ]);

            var output = transformjs.generate(ast);
            assert.equal(output, 'var a=1,b=5;');
        },

        'replace number': function() {
            var source = 'a = 1 + 10;';

            var ast = transformjs.transform(source, [
                function(node, next) {
                    if (node.TYPE == 'Number' && node.getValue() > 5) {
                        return new uglify.AST_Number({value: 5});
                    } else {
                        return next();                        
                    }
                }
            ]);

            var output = transformjs.generate(ast);
            assert.equal(output, 'a=1+5;');
        },

        'strips else': function() {
            var source = 'if (1) { a(); } else { b(); }';

            var ast = transformjs.transform(source, [
                function(node, next) {
                    if (node.TYPE == 'If') {
                        return next(node.body);
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
                    if (node.TYPE == 'If') {
                        var cond = node.condition;
                        if (cond.TYPE == 'Call') {
                            if (cond.expression.TYPE == 'SymbolRef' && cond.expression.name == 'has') {
                                var args = cond.args;
                                if (args.length == 1) {
                                    var featureNode = args[0];
                                    if (featureNode.TYPE == 'String') {
                                        var feature = featureNode.value;
                                        if (feature == 'bar') {
                                            return next(node.body);
                                        } else if (node.alternative) {
                                            return next(node.alternative);
                                        } else {
                                            return next(new uglify.AST_Null());
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
            var source = "var 1a";

            try {
                transformjs.transform(source, []);
                assert.fail();
            } catch (exc) {
                assert.equal(exc.line, 1);
                assert.equal(exc.col, 4);
                assert.equal(exc.message, 'Invalid syntax: 1a');
            }
        },

        'switch': function() {
            var source = "switch(a) {case b: 99; break; case c: 88; break; default: 77}";

            var ast = transformjs.transform(source, [
                function(node, next) {
                    return next();
                }
            ]);
            var output = transformjs.generate(ast);
            assert.equal(output, 'switch(a){case b:99;break;case c:88;break;default:77}');
        },

        'branch removal': function() {
            function testSource(source, expected) {
                var ast = transformjs.transform(source, [
                    transformjs.branchRemover(function(node, next) {
                        if (node.TYPE == 'Call') {
                            if (node.expression.TYPE == 'SymbolRef'
                                && node.expression.name == 'has') {
                                var args = node.args;
                                if (args.length == 1) {
                                    var arg1 = args[0];
                                    if (arg1.TYPE == 'String') {
                                        var str = arg1.value;
                                        return str == 'bullseye' ? 'pass' : 'fail';
                                    }
                                }
                            }
                        }
                    })
                ]);
                var output = transformjs.generate(ast);
                assert.equal(output, expected);
            }

            testSource("if (true) { 42 } else { 66 }", "{42}");
            testSource("if (false) { 42 } else { 66 }", "{66}");
            testSource("true ? 42 : 66", "42;");
            testSource("has('bullseye') ? 1 : 2", "1;");
            testSource("has('bullseye') && false ? 1 : 2", "2;");
            testSource("has('bullseye') && 0 ? 1 : 2", "2;");
            testSource("has('bull') ? 1 : 2", "2;");
            testSource("has('bull') || true ? 1 : 2", "1;");
            testSource("has('bull') || 1 ? 1 : 2", "1;");
            testSource("has('bull') || 0 ? 1 : 2", "2;");
        },

        'multiple filters': function() {
            function testSource(source, expected) {
                var ast = transformjs.transform(source, [
                    function(node, next) {
                        // D&&D('a');
                        return next();
                    },
                    function(node, next) {
                        // D&&D('b');
                        return next();
                    }
                ]);
                var output = transformjs.generate(ast);
                assert.equal(output, expected);
            }

            testSource("a", "a;");
        },

        // 'object': function() {
        //     var source = "var a = {foo: function() {42}}";

        //     var ast = transformjs.transform(source, [
        //         function(node, next) {
        //             console.log(require('util').inspect(node, null, 200));
        //             return next();
        //         }
        //     ]);
        //     var output = transformjs.generate(ast);
        //     assert.equal(output, 'try{a}catch(exc){b}finally{c}');
        // },

        // 'stuff': function() {
        //     var source = "true";

        //     var ast = transformjs.transform(source, [
        //         function(node, next) {
        //             return next();
        //         }
        //     ]);
        //     var output = transformjs.generate(ast);
        //     assert.equal(output, ');
        // }
    }
}).export(module);
