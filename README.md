transformjs
===========

Transforms JavaScript code safely.

TransformJS is based on the [Uglify](https://github.com/mishoo/UglifyJS) JavaScript parser.  Once Uglify has parsed the JavaScript into an abstract syntax tree (AST), TransformJS allows you to traverse the AST and add, remove, replace, or modify nodes along the way.

TransformJS can be used for static analysis to remove dead code or for searching for patterns in the code. If you're using hand-rolled regular expressions for transforming JavaScript, TransformJS offers you a safer option by parsing the code according to the language grammar and outputting valid code.

Installation
------------

    $ npm install transformjs

Usage
------------

Here is an example that replaces all numbers with the value 2.

    var transformjs = require('transformjs');
    var ast = transformjs.transform('if (1) { a() } else { b() }', [
        function(node, next) {
            if (node.type == 'num') {
                return {type: 'num', value: 2};
            } else {
                return next();
            }
        },
    ]);

    console.log(transformjs.generate(ast));


Traversal occurs from top to bottom.  Filter functions are called in order for each node.
The filter can return the node unchanged, return a new node to take its place, or return null
to remove the node.

You are responsible for calling the next() function in order to call the next filter. If you
do not call next(), then you are responsible for traversing each of the sub-nodes of the node
by passing each sub-node to the next function. 

    function(node, next) {
        if (node.type == 'binary') {
            // Traverse the child nodes of the expression one by one
            node.left = next(node.left);
            node.right = next(node.right);
            // Return the node without calling next, thereby ignoring subsequent filters
            return node;
        } else {
            // Continue processing node and traversing its child nodes
            return next();
        }
    }

License 
-------

Copyright 2011 Joe Hewitt

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
 
   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
