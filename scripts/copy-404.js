const { copyFileSync } = require('fs');
copyFileSync('./dist/index.html','./dist/404.html');
console.log('Copied dist/index.html -> dist/404.html');
