# restfulapigenerator

借鉴了[get-it-ready](https://github.com/pankajpatel/get-it-ready) ，遍历componentPath指定的目录中以*.components.js方式命名的文件，并且遵照[hapi-swagger](https://github.com/glennjones/hapi-swagger)规则，可以自动生成swagger测试文档。

* 详细用法参考[restfulapigenerator-example.git](https://github.com/zhipeng515/restfulapigenerator-example.git)。

```JS
server.register(
	[{
		'register': require('restfulapigenerator'),
		'options': {
			componentPath: __dirname + '/components/',
			db: require('mongoose')
		}
	},
	{
            	'register': require('hapi-swagger'),
            	'options': {
                info: {
                    'title': 'XXXXXX API Documentation',
                    'version': require('./package').version,
                },
                debug: true
            }
        }]
);
```

例子
```JS
//games.component.js

const Joi = require('joi');		
module.exports = {
	info: {
        name: 'Game',
        version: '0.0.1'
    },
    Schema: {
        title         : { type: String, required: true, trim: true, joi: Joi.string() },
        content       : { type: String, required: true, trim: true, joi: Joi.string() },
        cover         : { type: String, required: true, trim: true, joi: Joi.string().uri({scheme:/https?/}) },
        media         : { type: String, required: true, trim: true, joi: Joi.string().uri({scheme:/https?/}) }
    }
}
```

自定义更多功能
```JS
//session.component.js

const Joi = require('joi');
const apiInfo = require('restfulapigenerator').apiInfo;
const Boom = require('boom');
const  _ = require('lodash');

module.exports = {
    info: {
        name: 'Session',
        version: '0.0.1'
    },
    Schema: {
        "userName"      : { type: String, required: true, unique: true, reply: false, trim: true, joi: Joi.string().email() },
        "password"      : { type: String, required: true, trim: true, reply: false, joi: Joi.string().regex(/^[\@A-Za-z0-9\!\#\$\%\^\&\*\.\~]{6,22}$/) },
        "tokens"        : { type: Array, validated: false, joi: Joi.array().items(Joi.object({token: Joi.string().regex(/[A-Za-z0-9]/), createdAt: Joi.date()})) }
    },
    Options: {
        routes: {
            getAll: {
                disable: true
            },
            getOne: {
                disable: true
            },
            update: {
                disable: true
            },
            create: {
                description: '创建token',
                notes: '根据用户名密码创建token'
            }
        },
        controllers: {
            create: {
                response: {
                    schema: {
                        token: Joi.string()
                    }
                },
                handler: function (request, reply) {
                    var payload = request.payload;
                    var object = new apiInfo.Session.model(payload);
                    object.save(function(err, data) {
                        if (!err) {
                            reply({token: _.toString(data.id)}).created('/' + data.id); // HTTP 201
                        } else {
                            reply(Boom.badImplementation(err));
                        }
                    })
                }
            }
        }
    }
};
```
