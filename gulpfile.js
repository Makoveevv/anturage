"use strict";

const {src, dest} = require("gulp");
const gulp = require("gulp");
const autoprefixer = require("gulp-autoprefixer");
const cssbeautify = require("gulp-cssbeautify");
const removeComments = require('gulp-strip-css-comments');
const rename = require("gulp-rename");
const tildeImporter = require('node-sass-tilde-importer');
const sass = require("gulp-sass")(require("sass"));
const cssnano = require("gulp-cssnano");
const uglify = require("gulp-uglify");
const plumber = require("gulp-plumber");
const notify = require("gulp-notify");
const del = require('delete');
const webpack = require('webpack');
const webpackStream = require('webpack-stream');
const browserSync = require("browser-sync").create();


/* Paths */
const srcPath = 'src/';
const distPath = 'dist/';

const path = {
    build: {
        html:   distPath,
        js:     distPath + "assets/js/",
        json:   distPath + "assets/json/",
        css:    distPath + "assets/css/",
        img:    distPath + "assets/img/",
        fonts:  distPath + "assets/fonts/",
        php:    distPath + "assets/php/"
    },
    src: {
        html:   srcPath + "*.html",
        js:     srcPath + "assets/js/*.js",
        json:   srcPath + "assets/json/*.json",
        css:    srcPath + "assets/{scss,css,less}/*.{scss,css,less}",
        img:    srcPath + "assets/img/**/*.{jpg,jpeg,png,svg,gif,ico,webp,webmanifest,xml,json}",
        fonts:  srcPath + "assets/fonts/**/*.{eot,woff,woff2,ttf,svg}",
        php:    srcPath + "assets/php/**/*.php"
    },
    watch: {
        html:   srcPath + "**/*.html",
        js:     srcPath + "assets/js/**/*.js",
        json:   srcPath + "assets/json/**/*.json",
        css:    srcPath + "assets/scss/**/*.scss",
        img:    srcPath + "assets/img/**/*.{jpg, jpeg,png,svg,gif,ico,webp,webmanifest,xml,json}",
        fonts:  srcPath + "assets/fonts/**/*.{eot,woff,woff2,ttf,svg}",
        php:    srcPath + "assets/php/**/*.php"
    },
    clean: "./" + distPath
};



/* Tasks */

function serve() {
    browserSync.init({
        server: {
            baseDir: "./" + distPath
        }
    });
}

function html() {
    return src(path.src.html, {base: srcPath})
        .pipe(plumber())
        .pipe(dest(path.build.html))
        .pipe(browserSync.reload({stream: true}));
}

function css() {
    return src(path.src.css, {base: srcPath + "assets/scss/"})
        .pipe(plumber({
            errorHandler : function(err) {
                notify.onError({
                    title:    "SCSS Error",
                    message:  "Error: <%= error.message %>"
                })(err);
                this.emit('end');
            }
        }))
        .pipe(sass({
            includePaths: './node_modules/',
            silenceDeprecations: ['legacy-js-api'],
            importer: tildeImporter
        }))
        .pipe(autoprefixer({
            cascade: true
        }))
        .pipe(cssbeautify())
        .pipe(dest(path.build.css))
        .pipe(cssnano({
            zindex: false,
            discardComments: {
                removeAll: true
            }
        }))
        .pipe(removeComments())
        .pipe(rename({
            suffix: ".min",
            extname: ".css"
        }))
        .pipe(dest(path.build.css))
        .pipe(browserSync.reload({stream: true}));
}

function cssWatch() {
    return src(path.src.css, {base: srcPath + "assets/scss/"})
        .pipe(plumber({
            errorHandler : function(err) {
                notify.onError({
                    title:    "SCSS Error",
                    message:  "Error: <%= error.message %>"
                })(err);
                this.emit('end');
            }
        }))
        .pipe(sass({
            includePaths: './node_modules/',
            importer: tildeImporter
        }))
        .pipe(rename({
            suffix: ".min",
            extname: ".css"
        }))
        .pipe(dest(path.build.css))
        .pipe(browserSync.reload({stream: true}));
}

function js() {
    return src(path.src.js, {base: srcPath + 'assets/js/'})
        .pipe(plumber({
            errorHandler : function(err) {
                notify.onError({
                    title:    "JS Error",
                    message:  "Error: <%= error.message %>"
                })(err);
                this.emit('end');
            }
        }))
        .pipe(webpackStream({
          mode: "development",
          output: {
            filename: 'script.js',
          },
          watch: false,
          devtool: "source-map",
          module: {
            rules: [
                {
                test: /\.m?js$/,
                exclude: /(node_modules|bower_components)/,
                use: {
                    loader: 'babel-loader',
                    options: {
                    presets: [['@babel/preset-env', {
                        corejs: 3,
                        useBuiltIns: "usage"
                    }]]
                    }
                }
                }
            ]
            }
        }))
        .pipe(dest(path.build.js))
        .pipe(browserSync.reload({stream: true}));
}

function jsWatch() {
    return src(path.src.js, {base: srcPath + 'assets/js/'})
        .pipe(plumber({
            errorHandler : function(err) {
                notify.onError({
                    title:    "JS Error",
                    message:  "Error: <%= error.message %>"
                })(err);
                this.emit('end');
            }
        }))
        .pipe(webpackStream({
            mode: "production",
            output: {
              filename: 'script.js',
            },
            module: {
              rules: [
                  {
                  test: /\.m?js$/,
                  exclude: /(node_modules|bower_components)/,
                  use: {
                      loader: 'babel-loader',
                      options: {
                      presets: [['@babel/preset-env', {
                          debug: true,
                          corejs: 3,
                          useBuiltIns: "usage"
                      }]]
                      }
                  }
                  }
              ]
              }
          }))
        .pipe(dest(path.build.js))
        .pipe(browserSync.reload({stream: true}));
}

function json() {
    return src(path.src.json, {base: srcPath + 'assets/json/'})
        .pipe(dest(path.build.json))
        .pipe(browserSync.reload({stream: true}));
}

function jsonWatch() {
    return src(path.src.json, {base: srcPath + 'assets/json/'})
        .pipe(dest(path.build.json))
        .pipe(browserSync.reload({stream: true}));
}

function img() {
    return src(path.src.img)
        .pipe(dest(path.build.img))
        .pipe(browserSync.reload({stream: true}));
}

function fonts() {
    return src(path.src.fonts)
        .pipe(dest(path.build.fonts))
        .pipe(browserSync.reload({stream: true}));
}

function cleanDist() {
    return del([distPath]);
}

function watchFiles() {
    gulp.watch([path.watch.html], html);
    gulp.watch([path.watch.css], cssWatch);
    gulp.watch([path.watch.js], jsWatch);
    gulp.watch([path.watch.json], jsonWatch);
    gulp.watch([path.watch.img], img);
    gulp.watch([path.watch.fonts], fonts);
}

const build = gulp.series(gulp.parallel(html, css, js, json, img, fonts));
const watch = gulp.parallel(cleanDist, build, watchFiles, serve);



/* Exports Tasks */
exports.html = html;
exports.css = css;
exports.js = js;
exports.json = json;
exports.img = img;
exports.fonts = fonts;
exports.build = build;
exports.watch = watch;
exports.default = watch;