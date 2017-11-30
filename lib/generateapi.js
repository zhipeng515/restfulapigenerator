'use strict';

var path = require('path');
var apiBuilder = require('./apibuilder')
var requireAll = require('require-all');

var globalApiInfo = {};

module.exports.register = function (server, options, next) {
    requireAll({
        dirname: options.componentPath,
        filter: /(.+component)\.js$/,
        recursive: true,
        resolve: function(component) {
            var api = apiBuilder(
                component.Schema,
                component.info.name.toLowerCase()+'s',
                component.info.name,
                component.info.name.toLowerCase(),
                component.db || options.db,
                component.Options
            );

            server.route(api.routes);

            globalApiInfo[component.info.name] = api;

            if(typeof component.init == 'function') {
                component.init();
            }
        }
    });

    next();
}

module.exports.register.attributes = {
    name: 'GenerateApi',
    version: '0.0.2'
}

module.exports.apiInfo = globalApiInfo;
