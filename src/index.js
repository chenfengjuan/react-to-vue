'use strict';

var fs = require('fs');
var path = require('path');
var getProps = require('./props');
var getClass = require('./class');
var getTsInterfaceProps = require('./interfaceProps');
var saveComponent = require('./save');
var generateVueComponent = require('./generate');
var getFunctional = require('./functional');
var babelTraverse = require('babel-traverse').default;
var babelTypes = require('babel-types');
var babylon = require('babylon');
var chalk = require('chalk');
var transformTS = require('./ts');
var flowRemoveTypes = require('flow-remove-types');

var _require = require('./utility'),
    reportIssue = _require.reportIssue,
    removeBadCode = _require.removeBadCode,
    isVariableFunc = _require.isVariableFunc;

module.exports = function transform(src, options) {
  // read file
  let fileContent = fs.readFileSync(src);
  fileContent = fileContent.toString();
  // hard code
  fileContent = removeBadCode(fileContent);
  // if it is used with Flow type annotations
  if (options.flow) {
    fileContent = flowRemoveTypes(fileContent).toString();
  }
  // parse module
  let ast = babylon.parse(fileContent, {
    sourceType: 'module',
    plugins: ["typescript", "classProperties", "jsx", "trailingFunctionCommas", "asyncFunctions", "exponentiationOperator", "asyncGenerators", "objectRestSpread", "decorators"]
  });
  // 获取ts里的interface Props的名字
  let interfacePropsName = '';
  let componentName = '';
  if(options.ts) {
    babelTraverse(ast, {
      ClassDeclaration(path){
        const node = path.node
        if(node.superTypeParameters.params.length>0) {
          componentName=node.id.name;
          interfacePropsName = node.superTypeParameters.params[0].typeName.name
        }
      },
    });
    transformTS(ast);
  }
  // fix trailingComments issues with hard code 
  babelTraverse(ast, {
    BlockStatement(path) {
      path.node.body.forEach(item => {
        if (item.trailingComments && fileContent.charCodeAt([item.end]) === 10) {
          delete item.trailingComments;
        }
      });
    },
    ClassProperty(path) {
      let node = path.node;
      if (node.type === 'ClassProperty' && node.value.type === 'ArrowFunctionExpression') {
        const method = babelTypes.classMethod('method', node.key, node.value.params, node.value.body);
        path.replaceWith(method);
      }
    },
  });
  // traverse module
  let result = {
    "import": [],
    "declaration": [],
    "class": {},
    "functional": [],
    "propTypes": {},
    "defaultProps": {},
    // there exists incompatibility
    "caveats": [],
    "source": fileContent
  };
  
  babelTraverse(ast, {
    Program(path) {
      let nodeLists = path.node.body;
      let classDefineCount = 0;
      for (let i = 0; i < nodeLists.length; i++) {
        let node = nodeLists[i];
        let cPath = path.get(`body.${i}`);
        // 处理interface IProps
        if(node.type==='TSInterfaceDeclaration'&&node.body.type==='TSInterfaceBody'&&node.id.name===interfacePropsName) {
          // const propTypescode =result.source.slice(node.body.start, node.body.end);
          getTsInterfaceProps(componentName,node.body.body,result)
        } else if (cPath.isExpressionStatement() && node.expression.type === 'AssignmentExpression') {
          let leftNode = node.expression.left;
          if (leftNode.type === 'MemberExpression' && ["defaultProps", "propTypes"].includes(leftNode.property.name)) {
            let className = node.expression.left.object.name;
            getProps(className, leftNode.property.name, node.expression.right, result);
          }
        } else if (cPath.isClassDeclaration()) {
          classDefineCount++;
          if (classDefineCount > 1) {
            console.error('One file should have only one class declaration!');
            process.exit();
          }
        } else if (cPath.isExportDefaultDeclaration()) {
          result.exportName = node.declaration.name ? node.declaration.name : node.declaration.id.name;
        } else if (cPath.isVariableDeclaration() && !isVariableFunc(cPath)) {
          // it's just simple variable declaration, e.g. `let a = 1`
          result.declaration.push(fileContent.slice(node.start, node.end));
        }
      }
    },
    ImportDeclaration(path) {
      let node = path.node;
      // skip react and prop-types modules
      if (["react", "prop-types", "react-dom"].includes(node.source.value)) {
        return;
      }
      result.import.push(fileContent.slice(node.start, node.end));
    },
    ClassDeclaration(path) {
      if (path.parentPath.type !== 'Program' && path.parentPath.type !== 'ExportDefaultDeclaration') {
        reportIssue('This component seems like HOC or something else, we may not support it');
      }
      if (path.node.decorators) {
        result.caveats.push('react-to-vue does not support decorator for now');
      }
      getClass(path, fileContent, result);
    },
    FunctionDeclaration(path) {
      if (path.parentPath.type !== 'Program') {
        return;
      }
      // retrieve functional component
      getFunctional(path, fileContent, result);
    },
    ArrowFunctionExpression(path) {
      let variablePath = path.findParent(p => p.isVariableDeclaration());
      if (!variablePath || variablePath.parentPath.type !== 'Program' || path.getPathLocation().split('.').length > 4) {
        return;
      }
      // retrieve functional component
      getFunctional(path, fileContent, result, 'arrow');
    }
  });
  // check props validation
  if (!Object.keys(result.propTypes).length && /props/.test(fileContent)) {
    result.caveats.push(`There is no props validation, please check it manually`);
  }
  console.log(result)
  // generate vue component according to object
  let output = generateVueComponent(result);

  // save file
  saveComponent(options.output, output);

  // output caveats
  if (result.caveats.length) {
    console.log(chalk.red("Caveats:"));
    console.log(chalk.red(result.caveats.join('\n')));
  }
};