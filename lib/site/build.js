
var _ = require('lodash')
var path = require('path')
var glob = require('glob')
var Promise = require('bluebird')
var fs = require('fs-extra')

var sass = require('node-sass');

var nunjucks = require('nunjucks')
var markdown = require('nunjucks-markdown')
var marked = require('marked')

var Log = require('./log')

Promise.promisifyAll(fs)
Promise.promisifyAll(sass)

function Build(options) {

    if (!options) { options = {} }

    this.options = options

    this.log = new Log(this.options)

    this.srcDir = path.resolve(__dirname, '../../src')
    this.buildDir = path.resolve(__dirname, '../../build')

    this.templatesDirs = {}

    this.renderContext = this.options

    Promise.promisifyAll(this)
}

_.extend(Build.prototype, {
    execute: function execute(done) {
        this.log.info("Building site...")

        if (!done) { done = function() {} }

        this.resolveSeriallly([
            // setup build dir
            function() { return this.createBuildDirAsync() },
            // setup render context
            function() { return Promise.all([
                this.setupTemplateSearchPathsAsync(),
                this.setupSketchbookContextAsync()
            ]) },
            // compile files
            function() { return Promise.all([
                this.renderTemplatesAsync(),
                this.compileSassFilesAsync()
            ]) }
        ], _.bind(function(err, result) {
            if (err) {
                this.log.info('BUILD ERROR', err)
                return done(err)
            }
            done(null, result)
        }, this))
    },

    createBuildDir: function createBuildDir(done) {
        this.log.info('creating build dir...')
        this.resolveSeriallly([
            function() {
                this.log.debug('cleaning build dir...')
                return fs.removeAsync(this.buildDir)
            },
            function() {
                this.log.debug('copying src files...')
                return fs.copyAsync(this.srcDir, this.buildDir)
            }
        ], done)
    },

    setupTemplateSearchPaths: function setupTemplateSearchPaths(done) {
        this.log.info('preparing sketchbook...')

        var transformFn = _.bind(function(fileInfo, transformDone) {
            var inPath = fileInfo.srcPath

            // add dir to template dirs
            var inDir = path.dirname(inPath)
            this.templatesDirs[inDir] = true

            transformDone()
        }, this)

        this.mapFilesInGlob('**/*.html', this.buildDir, this.buildDir, transformFn, {}, done)
    },

    setupSketchbookContext: function setupSketchbookContext(done) {

        this.log.info('preparing sketchbook...')

        var sketchDir = path.resolve(this.buildDir, 'sketchbook')
        var sketches = {
            'misc': [],
        }

        var transformFn = _.bind(function(fileInfo, transformDone) {
            var inPath = fileInfo.srcPath

            // decide name of sketch
            var sketchName
            var inFilename = path.basename(inPath)
            if (inFilename === 'index.html') {
                sketchName = path.basename(path.dirname(inPath))
            } else {
                sketchName = path.basename(inFilename, '.html')
            }

            // make sketch object
            var sketch = {
                path: path.relative(sketchDir, inPath),
                name: sketchName
            }

            // determine sketch group
            var sketchRelPath = path.relative(sketchDir, inPath)
            var tokens = sketchRelPath.split(path.sep)
            var sketchGroup = 'misc'

            if (tokens.length > 1) {
                sketchGroup = tokens[0]
            }

            if ( !(sketchGroup in sketches) ) {
                sketches[sketchGroup] = []
            }

            // add sketch to collection
            this.log.debug('pushing sketch: ' + sketchGroup + ' <- ' + JSON.stringify(sketch))
            sketches[sketchGroup].push(sketch)

            transformDone()
        }, this)

        this.mapFilesInGlob('**/*.html', sketchDir, sketchDir, transformFn, {
            ignore: [
                '**/_*.html',
                'index.html', // ignore sketchbook table of contents
            ]
        }, _.bind(function() {
            this.renderContext.sketchGroups = _.keys(sketches)
            this.renderContext.sketches = sketches
            done()
        }, this))
    },

    compileSassFiles: function compileSassFiles(done) {

        this.log.info('compiling sass...')

        var inDir = path.resolve(this.buildDir, 'scss')
        var outDir = path.resolve(this.buildDir, 'css')

        var transformFn = _.bind(function(fileInfo, transformDone) {

            var inPath = fileInfo.srcPath
            var outFilename = path.basename(fileInfo.destPath, '.scss') + '.css'
            var outPath = path.join(path.dirname(fileInfo.destPath), outFilename)

            this.log.debug('(sass) -> ' + outPath)

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
        this.log.info('rendering templates...')

        this.templatesDir = path.resolve(this.buildDir, 'templates')

        // convert template dirs object to array of paths
        var templateSearchPaths = _.keys(this.templatesDirs)
        this.log.debug('template search paths', templateSearchPaths)

        // configure renderer
        var renderer = new nunjucks.Environment(
            new nunjucks.FileSystemLoader(templateSearchPaths),
            {
                trimBlocks: true,
                lstripBlocks: true,
                throwOnUndefined: true, // error if we encounter a template var that we did not provide a val for
                autoescape: true,       // auto-escape for now...
            })

        var renderContext = this.getRenderContext()
        this.log.debug("rendercontext: " + JSON.stringify(renderContext, null, 2))

        // Enable markdown support in templates w/ marked via nunjucks-markdown
        markdown.register(renderer, marked);

        Promise.promisifyAll(renderer)

        var transformFn = _.bind(function(fileInfo, transformDone) {
            var inPath = fileInfo.srcPath
            var outPath = fileInfo.destPath
            this.log.debug('(rt) -> ' + outPath)

            renderer.renderAsync(inPath, renderContext)
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

    getRenderContext: function getRenderContext() {
        return this.renderContext
    },

    resolveSeriallly: function resolveSeriallly(steps, done) {
        var p = Promise.resolve('')

        _.each(steps, _.bind(function(step) {
            // this.log.info('queueing ' + step)
            if (step instanceof Promise) {
                p = p.then(function() { return step })
            } else if (_.isFunction(step)) {
                p = p.then(_.bind(function() {
                    // this.log.debug('dequeueing ' + step)
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

        this.log.debug('mapFilesInGlob', {
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

                this.log.debug('mapFilesInGlob match: ' + relativePath)

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
})

module.exports = Build
