
var _ = require('lodash')
var path = require('path')
var chalk = require('chalk')
var glob = require('glob')
var Promise = require('bluebird')
var fs = require('fs-extra')

var sass = require('node-sass');

var nunjucks = require('nunjucks')
var markdown = require('nunjucks-markdown')
var marked = require('marked')

Promise.promisifyAll(fs)
Promise.promisifyAll(sass)

function Build(options) {

    if (!options) { options = {} }

    this.options = options
    this.srcDir = path.resolve(__dirname, '../../src')
    this.buildDir = path.resolve(__dirname, '../../build')

    Promise.promisifyAll(this)
}

_.extend(Build.prototype, {
    execute: function execute(done) {
        this.info("Building site...")

        if (!done) { done = function() {} }

        this.resolveSeriallly([
            function() { return this.createBuildDirAsync() },
            function() { return Promise.all([
                this.renderTemplatesAsync(),
                this.compileSassFilesAsync()
            ]) }
        ], _.bind(function(err, result) {
            if (err) {
                this.info('BUILD ERROR', err)
                return done(err)
            }
            done(null, result)
        }, this))
    },

    createBuildDir: function createBuildDir(done) {
        this.info('creating build dir...')
        this.resolveSeriallly([
            function() {
                this.debug('cleaning build dir...')
                return fs.removeAsync(this.buildDir)
            },
            function() {
                this.debug('copying src files...')
                return fs.copyAsync(this.srcDir, this.buildDir)
            }
        ], done)
    },

    compileSassFiles: function compileSassFiles(done) {

        this.info('compiling sass...')

        var inDir = path.resolve(this.buildDir, 'scss')
        var outDir = path.resolve(this.buildDir, 'css')

        var transformFn = _.bind(function(fileInfo, transformDone) {

            var inPath = fileInfo.srcPath
            var outFilename = path.basename(fileInfo.destPath, '.scss') + '.css'
            var outPath = path.join(path.dirname(fileInfo.destPath), outFilename)

            this.debug('(sass) -> ' + outPath)

            sass.renderAsync({
                file: inPath,
                outFile: outPath
            })
                .then(function(result) {
                    return fs.writeFileAsync(outPath, result.css, { encoding: 'utf-8' })
                })
                .then(function() {
                    transformDone()
                })
                .catch(function(err) {
                    transformDone(err)
                })
        }, this)

        this.mapFilesInGlob('**/*.scss', inDir, outDir, transformFn, {}, done)
    },

    renderTemplates: function renderTemplates(done) {
        this.info('rendering templates...')

        this.templatesDir = path.resolve(this.buildDir, 'templates')

        // Note sure this is needed
        var pagesAbsPaths = [
            this.buildDir,
            path.resolve(this.buildDir, 'posts'),
            path.resolve(this.buildDir, 'projects')
        ]

        var templatesAbsPaths = [
            path.resolve(this.buildDir, 'templates'),
            path.resolve(this.templatesDir, 'components'),
            path.resolve(this.templatesDir, 'layouts')
        ]

        var templateSearchPaths = [].concat(pagesAbsPaths, templatesAbsPaths)
        this.debug('template search paths', templateSearchPaths)

        // configure renderer
        var renderer = new nunjucks.Environment(
            new nunjucks.FileSystemLoader(templateSearchPaths),
            {
                trimBlocks: true,
                lstripBlocks: true,
                throwOnUndefined: true, // error if we encounter a template var that we did not provide a val for
                autoescape: true        // auto-escape for now...
            })


        // Enable markdown support in templates w/ marked via nunjucks-markdown
        markdown.register(renderer, marked);

        Promise.promisifyAll(renderer)

        var transformFn = _.bind(function(fileInfo, transformDone) {
            var inPath = fileInfo.srcPath
            var outPath = fileInfo.destPath
            this.debug('(rt) -> ' + outPath)

            renderer.renderAsync(inPath, this.getTemplateJson())
                .then(function(renderedText) {
                    fs.ensureDirSync(path.dirname(outPath))
                    fs.writeFileSync(outPath, renderedText)
                    transformDone()
                })
                .catch(transformDone)
        }, this)

        this.mapFilesInGlob('**/*.html', this.buildDir, this.buildDir, transformFn, {
            ignore: [
                'templates/**/*.html',
            ]
        }, done)
    },

    // Helper methods

    getTemplateJson: function getTemplateJson() {
        return this.options
    },

    resolveSeriallly: function resolveSeriallly(steps, done) {
        var p = Promise.resolve('')

        _.each(steps, _.bind(function(step) {
            // this.info('queueing ' + step)
            if (step instanceof Promise) {
                p = p.then(function() { return step })
            } else if (_.isFunction(step)) {
                p = p.then(_.bind(function() {
                    // this.debug('dequeueing ' + step)
                    return step.apply(this, arguments)
                }, this))
            } else {
                p = p.then(function() { return step })
            }
        }, this))

        p.then(function(result) {
            done(null, result)
        }).catch(function(err) {
            done(err)
        })
    },

    // transformFn must take care of file reading and writing
    // it is passed file src/dest path info, and must call done when complete
    //
    //   transformFn(
    //     { relPath, srcPath, destPath }, done
    //   )
    //
    mapFilesInGlob: function transformFilesInGlob(pattern, srcBasePath, outputBasePath, transformFn, options, done) {

        this.debug('mapFilesInGlob', {
            pattern: pattern,
            srcBasePath: srcBasePath,
            outputBasePath: outputBasePath,
            options: options
        })

        if (typeof options === 'function') {
            done = options
            options = {}
        } else if (typeof options === 'undefined') {
            options = {}
        }

        if (!transformFn) {
            throw new Error('transformFn must be defined')
        }
        if (!done) {
            throw new Error('done must be defined')
        }

        var transformFnAsync = Promise.promisify(transformFn)
        var promises = []

        new glob.Glob(pattern, {
            cwd: srcBasePath,
            nodir: true,
            ignore: options.ignore
        })
            .on('match', _.bind(function(relativePath) {

                this.debug('mapFilesInGlob match: ' + relativePath)

                var srcPath = path.resolve(srcBasePath, relativePath)
                var outputPath = path.resolve(outputBasePath, relativePath)

                // we need to manually create a promise here, since we
                // are opening another stream to read the file
                // promise is resolved when we finish reading the file
                promises.push(transformFnAsync({
                    relPath: relativePath,
                    srcPath: srcPath,
                    destPath: outputPath
                }))
            }, this))
            .on('error', function(err) {
                done(err)
            })
            .on('end', function() {
                // Once we're done globbing,
                // wait for all file transform ops to finish
                console.log('waiting for file transforms to finish...')
                Promise.all(promises)
                    .then(function() {
                        done()
                    })
                    .catch(function(err) {
                        done(err)
                    })
            })
    },

    log: function info(msg, obj, chalkFn) {
        if (!chalkFn) {
            chalkFn = function(x) { return x }
        }

        console.log(chalkFn(msg))
        if (obj instanceof Error) {
            console.log(chalkFn(obj.stack))
        } else if (_.isObject(obj)) {
            console.log(chalkFn(JSON.stringify(obj, null, 2)))
        } else if (obj) {
            console.log(chalkFn(obj))
        }
    },

    info: function info(msg, obj) {
        this.log(msg, obj, chalk.white)
    },

    debug: function debug(msg, obj) {
        if (this.options.debug) {
            this.log(msg, obj, chalk.green)
        }
    }
})

module.exports = Build
