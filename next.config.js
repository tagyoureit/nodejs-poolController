/* if (typeof require !== "undefined") {

    require.extensions[".less"] = () => {};
   
    require.extensions[".css"] = (file) => {};
   
   }

   const withCSS = require('@zeit/next-css')
module.exports = withCSS({

    module: {
      rules: [
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader'],
        },
      ],
    },
  }) 
*/ 

//next.config.js
const withCSS = require('@zeit/next-css')
module.exports = withCSS() 