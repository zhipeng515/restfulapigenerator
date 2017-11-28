'use strict';

var Joi = require('joi');
var Boom = require('boom');
var assert = require('power-assert');
var _ = require('lodash');

var mongooseSoftDelete = require('mongoose-softdelete');
var mongooseSqeuenceId = require('mongoose-sequenceid');
const sequenceId = require('flocon-new');

var mongoose = require('mongoose');
var Schema = mongoose.Schema;

var modelNameForAssert = '';

function apiBuilder(schemaDefination, routeBaseName, modelName, singularRouteName, db, options) {

    assert(schemaDefination, 'Schema Defination is required');
    assert(routeBaseName, 'Route Base Name is required');
    assert(modelName, 'Model Name is required');
    assert(singularRouteName, 'Singular Model\'s Route Name is required');

    modelNameForAssert = modelName;

    var validations = buildValidationObject(schemaDefination);
    var schema = buildSchema(validations.schema, validations.join, options);
    var model = buildModel(modelName, schema, db);
    var responses = buildControllersResponses(validations.put, validations.join, options);
    var controllers = buildControllers(model, validations, responses, singularRouteName, options);
    var routes = buildRoutes(controllers, routeBaseName, singularRouteName, options);

    return {
        validations: {
            post: validations.post,
            put: validations.put,
        },
        schema: schema,
        model: model,
        controllers: controllers,
        routes: routes,
        responses: responses
    }
}

function buildValidationObject(config) {
    var post = {}, put = {};
    var join = [];
    var schema = Object.assign({}, config);
    for (var prop in schema) {
        var itemConf = schema[prop];
        if (itemConf === null) {
            throw new Error('Null configs are not supported!');
        }
        if (itemConf.joi) {
            if (!itemConf.joi.isJoi) {
                itemConf.joi = Joi.object(itemConf.joi);
            }
            put[prop] = itemConf.joi;
            if (itemConf.required) {
                post[prop] = itemConf.joi.required()
            } else {
                post[prop] = itemConf.joi;
            }

            delete schema[prop].joi;
        }
        if(itemConf.join) {
            join.push(itemConf.join);
            delete schema[prop].join;
        }
    }
    return {
        schema: schema,
        join: join,
        post: post,
        put: put,
    }
}

function optionTypeof(option, type) {
    if(type instanceof Array) {
        for(var t in type) {
            if(typeof option == type[t])
                return true;
        }
        return false;
    } else if (typeof option != type) {
        return false;
    }
    return true;
}

function getOptions(from, method, type, item, options) {
    if (options == undefined)
        return null;

    if (eval('options.' + from) == undefined)
        return null;
    if (eval('options.' + from + '.' + method) == undefined)
        return null;
    var result = eval('options.' + from + '.' + method + '.' + item);
    var resultCheck = optionTypeof(result, type);
    if (result != undefined) {
        assert(resultCheck,
            modelNameForAssert + ' ' + from + ' ' + method + ' ' + item + '(' + result + ')' + ' must be a ' + type);
    }
    return resultCheck ? result : null;
}

function getControllerHandlerFromOptions(method, options) {
    return getOptions('controllers', method, 'function', 'handler', options);
}

function getControllerValidateFromOptions(method, options) {
    return getOptions('controllers', method, 'object', 'validate', options);
}

function getControllerResponseFromOptions(method, options) {
    return getOptions('controllers', method, 'object', 'response', options);
}

function getRouteDescriptionFromOptions(method, options) {
    return getOptions('routes', method, 'string', 'description', options);
}

function getRouteNotesFromOptions(method, options) {
    return getOptions('routes', method, 'string', 'notes', options);
}

function getRouteDisableFromOptions(method, options) {
    return getOptions('routes', method, 'boolean', 'disable', options);
}

function getRouteAuthFromOptions(method, options) {
    return getOptions('routes', method, ['string', 'object', 'boolean'], 'auth', options);
}

function getControllerSchemaFilterFromOptions(method, options) {
    return getOptions('controllers', method, 'object', 'filter', options);
}

function getControllerSchemaConditionFromOptions(method, options) {
    return getOptions('controllers', method, 'function', 'condition', options);
}

function getControllerSchemaSortFromOptions(method, options) {
    return getOptions('controllers', method, 'function', 'sort', options);
}

function buildControllers(model, joiValidationObject, responses, singularRouteName, options) {
    var defaultHandler = {
        getAll: function (request, reply) {
            var pageSize = request.query.pageSize || 20;
            var lastId = request.query.lastId || sequenceId.MAX_INTEGER_STRING;
            var filter = responses.getAll.filter;
            var condition = responses.getAll.condition(request);
            var sort = responses.getAll.sort(request);
            model.findAll(lastId, pageSize, filter, condition, sort).then(
                function (data) {
                    if (_.isEmpty(data)) {
                        reply(Boom.notFound('Cannot find any ' + singularRouteName));
                    } else {
                        reply(data);
                    }
                },
                function (error) {
                    if (error) {
                        reply(Boom.badImplementation(error)); // 500 error
                    }
                }
            );
        },
        getOne: function (request, reply) {
            var filter = responses.getOne.filter;
            var condition = responses.getOne.condition(request);
            model.findById(request.params.id, filter, condition).then(
                function (data) {
                    if (_.isNull(data)) {
                        reply(Boom.notFound('Cannot find ' + singularRouteName + ' with that id'));
                    } else {
                        reply(data);
                    }
                },
                function (error) {
                    if (error) {
                        reply(Boom.notFound(error)); // 500 error
                    }
                }
            );
        },
        create: function (request, reply) {
            var payload = request.payload;
            var object = new model(payload);
            object.save(function (err, data) {
                if (!err) {
                    reply({id: data.id.toString()}).created('/' + data.id); // HTTP 201
                } else {
                    if (11000 === err.code || 11001 === err.code) {
                        reply(Boom.forbidden('please provide another ' + singularRouteName + ' id, it already exist'));
                    } else {
                        reply(Boom.forbidden(getErrorMessageFrom(err))); // HTTP 403
                    }
                }
            });
        },
        update: function (request, reply) {
            var filter = responses.update.filter;
            var condition = responses.update.condition(request);
            model.findByIdAndUpdate(request.params.id, request.payload, filter, condition).then(
                function (data) {
                    if (_.isNull(data)) {
                        reply(Boom.notFound('Cannot find ' + singularRouteName + ' with that id'));
                    } else {
                        reply({id: data.id.toString()}).location('/' + data.id); // HTTP 201;
                    }
                },
                function (error) {
                    if (error) {
                        reply(Boom.notFound('Cannot find ' + singularRouteName + ' with that id'));
                    }
                }
            );
        },
        remove: function (request, reply) {
            var condition = responses.remove.condition(request);
            model.findByIdNoLean(request.params.id, condition).then(
                function (data) {
                    if (_.isNull(data)) {
                        reply(Boom.notFound('Cannot find ' + singularRouteName + ' with that id'));
                    } else if (!data.deleted) {
                        data.softdelete(function (error, data) {
                            if (error) {
                                reply(Boom.badImplementation('Could not delete ' + singularRouteName));
                            } else {
                                reply({code: 200, message: singularRouteName + ' removed successfully'});
                            }
                        });
                    }
                    else {
                        reply({code: 201, message: singularRouteName + ' has already removed'});
                    }
                },
                function (error) {
                    if (error) {
                        reply(Boom.badImplementation('Could not delete ' + singularRouteName));
                    }
                }
            );
        }
    }
    var controllers = {
        getAll: {
            validate: getControllerValidateFromOptions('getAll', options) || {
                query: {
                    lastId: Joi.string().description('The last id, from lastest ' + singularRouteName + ' with an unspecified value'),
                    pageSize: Joi.number().integer().min(1).max(100).default(20).description('The number of ' + singularRouteName + ' per pages(1-100), default value is 20')
                }
            },
            response: getControllerResponseFromOptions('getAll', options) || {
                sample: 50,
                schema: Joi.array().items(responses.getAll.response)
            },
            handler: getControllerHandlerFromOptions('getAll', options) || defaultHandler.getAll
        },
        getOne: {
            validate: getControllerValidateFromOptions('getOne', options) || {
                params: {
                    id: Joi.string().required()
                }
            },
            response: getControllerResponseFromOptions('getOne', options) || {
                schema: responses.getOne.response
            },
            handler: getControllerHandlerFromOptions('getOne', options) || defaultHandler.getOne
        },
        create: {
            validate: getControllerValidateFromOptions('create', options) || {
                payload: joiValidationObject.post
            },
            response: getControllerResponseFromOptions('create', options) || {
                schema: responses.create.response
            },
            handler: getControllerHandlerFromOptions('create', options) || defaultHandler.create
        },
        update: {
            validate: getControllerValidateFromOptions('update', options) || {
                params: {
                    id: Joi.string().required()
                },
                payload: joiValidationObject.put
            },
            response: getControllerResponseFromOptions('update', options) || {
                schema: responses.update.response
            },
            handler: getControllerHandlerFromOptions('update', options) || defaultHandler.update
        },
        remove: {
            validate: getControllerValidateFromOptions('remove', options) || {
                params: {
                    id: Joi.string().required()
                }
            },
            response: getControllerResponseFromOptions('remove', options) || {
//                schema: responses.remove.response
            },
            handler: getControllerHandlerFromOptions('remove', options) || defaultHandler.remove
        }
    }
    return controllers;
}


function buildRoutes(controllers, routeBaseName, singularRouteName, options) {
    var routes = [];
    if (!getRouteDisableFromOptions('getAll', options)) {
        routes.push({
            method: 'GET',
            path: '/' + routeBaseName,
            config: {
                validate: controllers.getAll.validate,
                response: controllers.getAll.response,
                description: getRouteDescriptionFromOptions('getAll', options) || 'Get all ' + routeBaseName + '',
                notes: getRouteNotesFromOptions('getAll', options) || 'Returns a list of ' + routeBaseName + ' ordered by addition date',
                auth: getRouteAuthFromOptions('getAll', options) || false,
                tags: ['api', routeBaseName],
            },
            handler: controllers.getAll.handler
        });
    }
    if (!getRouteDisableFromOptions('getOne', options)) {
        routes.push({
            method: 'GET',
            path: '/' + routeBaseName + '/{id}',
            config: {
                validate: controllers.getOne.validate,
                response: controllers.getOne.response,
                description: getRouteDescriptionFromOptions('getOne', options) || 'Get ' + singularRouteName + ' by DB Id',
                notes: getRouteNotesFromOptions('getOne', options) || 'Returns the ' + singularRouteName + ' object if matched with the DB id',
                auth: getRouteAuthFromOptions('getOne', options) || false,
                tags: ['api', routeBaseName],
            },
            handler: controllers.getOne.handler
        });
    }
    if (!getRouteDisableFromOptions('update', options)) {
        routes.push({
            method: 'PUT',
            path: '/' + routeBaseName + '/{id}',
            config: {
                validate: controllers.update.validate,
                response: controllers.update.response,
                description: getRouteDescriptionFromOptions('update', options) || 'Update a ' + singularRouteName,
                notes: getRouteNotesFromOptions('update', options) || 'Returns a ' + singularRouteName + ' by the id passed in the path',
                auth: getRouteAuthFromOptions('update', options) || false,
                tags: ['api', routeBaseName],
            },
            handler: controllers.update.handler
        });
    }
    if (!getRouteDisableFromOptions('remove', options)) {
        routes.push({
            method: 'DELETE',
            path: '/' + routeBaseName + '/{id}',
            config: {
                validate: controllers.remove.validate,
                response: controllers.remove.response,
                description: getRouteDescriptionFromOptions('remove', options) || 'Delete ' + singularRouteName,
                notes: getRouteNotesFromOptions('remove', options) || 'Returns the ' + singularRouteName + ' deletion status',
                auth: getRouteAuthFromOptions('remove', options) || false,
                tags: ['api', routeBaseName],
            },
            handler: controllers.remove.handler
        });
    }
    if (!getRouteDisableFromOptions('create', options)) {
        routes.push({
            method: 'POST',
            path: '/' + routeBaseName,
            config: {
                validate: controllers.create.validate,
                response: controllers.create.response,
                description: getRouteDescriptionFromOptions('create', options) || 'Add a ' + singularRouteName,
                notes: getRouteNotesFromOptions('create', options) || 'Returns a ' + singularRouteName + ' by the id passed in the path',
                auth: getRouteAuthFromOptions('create', options) || false,
                tags: ['api', routeBaseName],
            },
            handler: controllers.create.handler
        });
    }
    return routes;
}

function buildModel(modelName, schema, db) {
    if (db === undefined) {
        db = Mongoose;
    }
    return db.model(modelName, schema);
}

function getNewFilter(filter, optionsFilter) {
    if (optionsFilter == null || optionsFilter == undefined)
        return filter;
    var newFilter = '';
    filter.trim().split(' ').forEach(function (value) {
        if (_.startsWith(value, '-')) {
            value = _.trimStart(value, '-');
        }
        if (optionsFilter[value] != undefined) {
            if (optionsFilter[value]) {
                newFilter += ' ' + value;
            } else if (value == '_id') {
                newFilter += ' -' + value;
            }
        } else {
            newFilter += ' ' + value;
        }
    });
    return newFilter;
}

function buildResponseValidation(definitionObjectJoi, definitionJoin, filter) {
    var response = {};
    filter.trim().split(' ').forEach(function (value) {
        if (value == '_id') {
            response[value] = Joi.object();//Joi.string().regex(/^[0-9a-fA-F]{24}$/);
        } else if (value == 'id') {
            response[value] = Joi.string();
        } else if (!_.startsWith(value, '-')) {
            response[value] = definitionObjectJoi[value];
        }
    });
    if(definitionJoin instanceof Array){
        for (var index in definitionJoin) {
            var populate = definitionJoin[index];
            response[populate.path] = Joi.array().items(Joi.object());
        }
    }

    return response;
}

function defaultSchemaFilter(definitionObject) {
    var defaultFilter = '-_id id';
    for (var prop in definitionObject) {
        defaultFilter += ' ' + prop;
    }
    return defaultFilter;
}

function buildControllersResponses(definitionObject, definitionJoin, options) {
    var defaultFilter = defaultSchemaFilter(definitionObject);
    var getAllFilter = getNewFilter(defaultFilter, getControllerSchemaFilterFromOptions('getAll', options));
    var getOneFilter = getNewFilter(defaultFilter, getControllerSchemaFilterFromOptions('getOne', options));
    var createFilter = getNewFilter(defaultFilter, getControllerSchemaFilterFromOptions('create', options));
    var updateFilter = getNewFilter(defaultFilter, getControllerSchemaFilterFromOptions('update', options));
//    var removeFilter = getNewFilter(defaultFilter, getControllerSchemaFilterFromOptions('remove', options));

    var defaultCondition = function (request) {
        return null;
    }
    var defaultSort = function (request) {
        return null;
    }

    var controllersResponses = {
        getAll: {
            filter: getAllFilter,
            condition: getControllerSchemaConditionFromOptions('getAll', options) || defaultCondition,
            response: buildResponseValidation(definitionObject, definitionJoin, getAllFilter),
            sort: getControllerSchemaSortFromOptions('getAll', options) || defaultSort,
        },
        getOne: {
            filter: getOneFilter,
            condition: getControllerSchemaConditionFromOptions('getOne', options) || defaultCondition,
            response: buildResponseValidation(definitionObject, definitionJoin, getOneFilter)
        },
        create: {
            filter: createFilter,
            condition: getControllerSchemaConditionFromOptions('create', options) || defaultCondition,
            response: buildResponseValidation(definitionObject, definitionJoin, createFilter)
        },
        update: {
            filter: updateFilter,
            condition: getControllerSchemaConditionFromOptions('update', options) || defaultCondition,
            response: buildResponseValidation(definitionObject, definitionJoin, updateFilter)
        },
        remove: {
            filter: assert(getControllerSchemaFilterFromOptions('remove', options) == null,
                modelNameForAssert + ' controllers remove filter unsupport customized'),
            condition: getControllerSchemaConditionFromOptions('remove', options) || defaultCondition,
            response: {}
            // filter: 'unsupport',
            // condition: 'unsupport',
            // response: 'unsupport'
            // filter: removeFilter,
            // condition: getControllerSchemaConditionFromOptions('remove', options) || defaultCondition,
            // response: buildResponseValidation(definitionObject, removeFilter)
        }
    }

    return controllersResponses;
}


function buildSchema(definitionObject, definitionJoin, options) {
    var schema = new Schema(definitionObject, {toJSON: { virtuals: true }});
    schema.plugin(mongooseSoftDelete);
    schema.plugin(mongooseSqeuenceId);

    var defaultFilter = defaultSchemaFilter(definitionObject);

    var populateSelect = [];
    if(definitionJoin instanceof Array){
        for (var index in definitionJoin) {
            var populate = definitionJoin[index];
            schema.virtual(populate.path, populate.bind);
            if(populate.select){
                populateSelect.push({path: populate.path, select: populate.select});
            }
        }
    }

    schema.statics.findAll = function (lastId, pageSize, filter, condition, sort, callback) {
        var defaultCondition = {
            id: {$lt: lastId},
            deleted: {$ne: true}
        };
        var defaultSort = {id: 'desc'};

        if (typeof filter == 'function') {
            callback = filter;
        } else if (typeof condition == 'function') {
            callback = condition;
            if (filter)
                defaultFilter = filter;
        } else if (typeof sort == 'function') {
            callback = sort
            if (filter)
                defaultFilter = filter;
            if (condition)
                defaultCondition = condition;
        } else {
            if (filter)
                defaultFilter = filter;
            if (condition)
                defaultCondition = condition;
            if (sort)
                defaultSort = sort;
        }
        if(_.isEmpty(populateSelect)){
            return this.find(defaultCondition).select(defaultFilter).limit(pageSize).sort(defaultSort).lean().exec(callback);
        } else {
            return this.find(defaultCondition).select(defaultFilter).populate(populateSelect).limit(pageSize).sort(defaultSort).lean().exec(callback);
        }
    };
    schema.statics.findByIdNoLean = function (id, condition, callback) {
        var defaultCondition = {
            id: id,
            deleted: {$ne: true}
        }
        if (typeof condition == 'function') {
            callback = condition;
        } else if (condition) {
            defaultCondition = condition;
        }

        if(_.isEmpty(populateSelect)) {
            return this.findOne(defaultCondition).exec(callback);
        } else {
            return this.findOne(defaultCondition).populate(populateSelect).exec(callback);
        }
    };
    schema.statics.findById = function (id, filter, condition, callback) {
        var defaultCondition = {
            id: id,
            deleted: {$ne: true}
        }
        if (typeof filter == 'function') {
            callback = filter;
        } else if (typeof condition == 'function') {
            callback = condition;
            if (filter)
                defaultFilter = filter;
        } else {
            if (filter)
                defaultFilter = filter;
            if (condition)
                defaultCondition = condition;
        }

        if(_.isEmpty(populateSelect)) {
            return this.findOne(defaultCondition).select(defaultFilter).lean().exec(callback);
        } else {
            return this.findOne(defaultCondition).select(defaultFilter).populate(populateSelect).lean().exec(callback);
        }
    };
    schema.statics.findByIdAndUpdate = function (id, payload, filter, condition, callback) {
        var defaultCondition = {
            id: id,
            deleted: {$ne: true}
        }
        if (typeof filter == 'function') {
            callback = filter;
        } else if (typeof condition == 'function') {
            callback = condition;
            if (filter)
                defaultFilter = filter;
        } else {
            if (filter)
                defaultFilter = filter;
            if (condition)
                defaultCondition = condition;
        }

        return this.findOneAndUpdate(
            defaultCondition,
            payload,
            {new: true} // 为真返回更新之后的内容
        ).select(defaultFilter).lean().exec(callback);
    };

    return schema;
}

function getErrorMessageFrom(err) {
    var errorMessage = '';

    if (err.errors) {
        for (var prop in err.errors) {
            if (err.errors.hasOwnProperty(prop)) {
                errorMessage += err.errors[prop].message + ' '
            }
        }

    } else {
        errorMessage = err.message;
    }

    return errorMessage;
}

String.prototype.toObjectId = function () {
    var ObjectId = (mongoose.Types.ObjectId);
    return new ObjectId(this.toString());
};

module.exports = apiBuilder;
