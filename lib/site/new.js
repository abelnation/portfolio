
var _ = require('lodash')
var path = require('path')
var nunjucks = require('nunjucks')
var Promise = require('bluebird')
var markdown = require('nunjucks-markdown')
var marked = require('marked')
var fs = require('fs-extra')

Promise.promisifyAll(fs)

var Log = require('./log')

function SiteNew(opts) {
    this.options = opts
    this.log = new Log(opts)
}
_.extend(SiteNew.prototype, {
    newPost: function newPost(name, slug, opts, done) {

    },

    newPage: function newPage(name, slug, opts, done) {

    },

    newProject: function newProject(name, slug, opts, done) {

    },

    newSketch: function newSketch(name, pathToSketchFile, opts, done) {
        if (!done) { done = function() {} }

        // ensure .html is on the end of the path
        pathToSketchFile = path.join(
            path.dirname(pathToSketchFile),
            path.basename(pathToSketchFile, '.html') + '.html'
        )

        var srcDir = path.resolve(__dirname, '../../src/')
        var outPath = path.resolve(srcDir, 'sketchbook', pathToSketchFile)

        this.log.debug('outpath: ' + outPath)
        this.renderPageTemplate('_new-sketch.html', outPath, _.extend({
            name: name,
            slug: path.basename(pathToSketchFile, '.html'),
        }, opts), done)
    },

    renderPageTemplate: function renderPageTemplate(newTemplateName, destPath, opts, done) {

        var newTemplatesDir = path.resolve(__dirname, '../new')
        var newTemplateFilePath = path.resolve(newTemplatesDir, newTemplateName)

        this.log.info('renderPageTemplate: ' + newTemplateFilePath)

        // convert template dirs object to array of paths
        var templateSearchPaths = [ newTemplatesDir ]
        this.log.debug('search paths: ' + JSON.stringify(templateSearchPaths, null, 2))

        // configure renderer
        var renderer = new nunjucks.Environment(
            new nunjucks.FileSystemLoader(templateSearchPaths),
            {
                trimBlocks: true,
                lstripBlocks: true,
                throwOnUndefined: true, // error if we encounter a template var that we did not provide a val for
                autoescape: true,       // auto-escape for now...
            })

        var renderContext = opts
        this.log.debug("rendercontext: " + JSON.stringify(renderContext, null, 2))

        // Enable markdown support in templates w/ marked via nunjucks-markdown
        markdown.register(renderer, marked);


        Promise.promisifyAll(renderer)
        renderer.renderAsync(newTemplateFilePath, renderContext).bind(this)
            .then(function(renderedText) {

                this.log.debug('writing ' + destPath)
                this.log.debug(renderedText)

                fs.ensureDirSync(path.dirname(destPath))
                fs.writeFileSync(destPath, renderedText)
                done()
            })
            .catch(function(err) {
                this.log.info('render ERROR')
                this.log.info(err)
                done(err)
            })
    }
})

module.exports = SiteNew
