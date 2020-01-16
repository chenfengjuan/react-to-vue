'use strict';

// valid types that can be transformed to Vue types
const VALIDTYPES = {
  array: 'Array',
  bool: 'Boolean',
  func: 'Function',
  number: 'Number',
  object: 'Object',
  string: 'String',
  symbol: 'Symbol',
  boolean: 'Boolean',
};

module.exports = function (classname, nodes, root) {
  let result = null;
  result = root.propTypes[classname]={};
  for(let i = 0; i<nodes.length; i++) {
    const node = nodes[i];
    const name = node.key.name;
    const value = root.source.slice(node.start, node.end);
    const typeReg = new RegExp(`^${name}\\?{0,1}\\:\\s{0,}(\\S{1,})\\;`);
    const type = value.replace(typeReg, '$1').replace(/\,$/,'');
    if(node.optional) {
      if(VALIDTYPES[type]) {
        result[node.key.name]={
          type: VALIDTYPES[type],
        }
      } else {
        result[node.key.name]={
          validator: ()=>true
        }
      }
    } else {
      if(VALIDTYPES[type]) {
        result[node.key.name]={
          type: VALIDTYPES[type],
          required: true
        }
      } else {
        result[node.key.name]={
          validator: ()=>true,
          required: true
        }
      }
    }
    if(node.type==='TSMethodSignature') {
      result[node.key.name]['type'] = 'Function';
      delete result[node.key.name]['validator']
    }
  }
};