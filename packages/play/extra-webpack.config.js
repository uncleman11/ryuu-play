const webpack = require('webpack');

module.exports = {
  externals: {
    '@tensorflow/tfjs-node': 'commonjs @tensorflow/tfjs-node',
    '@tensorflow/tfjs-core': 'commonjs @tensorflow/tfjs-core'
  },
  resolve: {
    fallback: {
      assert: require.resolve("assert/"),
      os: require.resolve("os-browserify/browser"),
      path: require.resolve('path-browserify'),
      stream: require.resolve("stream-browserify"),
      constants: require.resolve("constants-browserify"),
      crypto: require.resolve("crypto-browserify"),
      http: require.resolve("stream-http"),
      https: require.resolve("https-browserify"),
      util: require.resolve("util/"),
      url: require.resolve("url/"),
      vm: require.resolve("vm-browserify"),
      zlib: require.resolve("browserify-zlib"),
      fs: false,

    }
  }
};
