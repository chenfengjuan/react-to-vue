#! /usr/bin/env node --harmony
'use strict'
var transform = require('../src/index.js')
var path = require('path')
var filepath = path.resolve(process.cwd(), '../loan-animate/src/components/FlipCard/index.tsx')
var outFile = path.resolve(process.cwd(), '../loan-animate-vue/src/components/FlipCard/index.jsx')
transform(filepath,{
  output: outFile,
  ts: true
})
