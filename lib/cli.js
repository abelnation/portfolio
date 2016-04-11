
var Promise = require('bluebird')
var path = require('path')
var childProcess = require('child_process');
var express = require('express')
var Gaze = require('gaze').Gaze

var Cli = require('cli-ck')
var SiteDeploy = require('./site/deploy')
var SiteBuild = require('./site/build')

var Actions = {
    cli: cli,

    build: function build(args, opts, done) {
        new SiteBuild({
            debug: opts.debug
        }).execute(done)
    },

    deploy: function deploy(done) {
        SiteDeploy.deploy()
    },

    watch: function watch(args, opts) {

        // Watch Source Files
        new Gaze('**', {
            debounceDelay: 1000,
            cwd: path.resolve(__dirname, '../src')
        })
            .on('error', function(err) {
                // Handle error here
                console.log('Gaze ERROR')
                console.log(err.stack)
            })
            .on('all', function(event, filepath) {
                new SiteBuild({
                    debug: opts.debug,
                    env: { dev: true }
                }).execute(function() {
                        console.log('done')
                    })
            })

        // LiveReload build files
        livereload = require('livereload');
        server = livereload.createServer();
        server.watch(path.resolve(__dirname, '../build'))

        // Serve build files statically
        var port = 3000
        var app = express()
        app.use(express.static(path.resolve(__dirname, '../build')));
        app.listen(port, function () {
            console.log('Example app listening on port ' + port);
        });

        // Open page in chrome
        childProcess.exec('open http://localhost:' + port);
    }
}
Promise.promisifyAll(Actions)

var buildCli = new Cli()
    .description('build site')
    .option('debug', {
        alias: 'd',
        defaultValue: false
    })
    .handler(function(args, opts) {
        Actions.build(args, opts)
    })

var deployCli = new Cli()
    .description('web server operations')
    .handler(function(args, opts) {
        Actions.deploy()
    })

var watchCli = new Cli()
    .description('watch site')
    .option('debug', {
        alias: 'd',
        defaultValue: false
    })
    .handler(function(args, opts) {
        Actions.build(args, opts, function() {
            Actions.watch(args, opts)
        })
    })

var cli = new Cli()
    .usage('$0 <COMMAND>')
    .description('Command line tool for all things create gate.  Use \'help\' to learn about commands')
    .command('build', buildCli)
    .command('watch', watchCli)
    .command('deploy', deployCli)

module.exports = cli
