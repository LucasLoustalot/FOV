const errorResponse = {
    type: 'object',
    properties: {
        error: { type: 'string' }
    }
};

const swaggerDocument = {
    openapi: '3.0.3',
    info: {
        title: 'FOV Backend API',
        version: '0.1.0',
        description: 'HTTP API for categories, streams, users, Twitch data, and FFmpeg stream control.'
    },
    servers: [{ url: '/', description: 'Current server' }],
    tags: [
        { name: 'Health' },
        { name: 'Categories' },
        { name: 'Streams' },
        { name: 'Users' },
        { name: 'Twitch' },
        { name: 'FFmpeg' }
    ],
    paths: {
        '/': {
            get: {
                tags: ['Health'],
                summary: 'Check that the backend is running',
                responses: { 200: { description: 'Backend status' } }
            }
        },
        '/api': {
            get: {
                tags: ['Health'],
                summary: 'Check that the API is available',
                responses: { 200: { description: 'API status' } }
            }
        },
        '/api/categories': {
            get: {
                tags: ['Categories'],
                summary: 'List categories ordered by viewer count',
                responses: {
                    200: { description: 'Category list' },
                    500: { $ref: '#/components/responses/ServerError' }
                }
            }
        },
        '/api/categories/{id}': {
            get: {
                tags: ['Categories'],
                summary: 'Get a category by ID',
                parameters: [{ $ref: '#/components/parameters/Id' }],
                responses: {
                    200: { description: 'Category' },
                    404: { $ref: '#/components/responses/NotFound' },
                    500: { $ref: '#/components/responses/ServerError' }
                }
            }
        },
        '/api/streams': {
            get: {
                tags: ['Streams'],
                summary: 'List streams ordered by viewer count',
                responses: {
                    200: { description: 'Stream list' },
                    500: { $ref: '#/components/responses/ServerError' }
                }
            }
        },
        '/api/streams/available': {
            get: {
                tags: ['Streams'],
                summary: 'List streams with available HLS tracks',
                responses: {
                    200: { description: 'Available streams' },
                    500: { $ref: '#/components/responses/ServerError' }
                }
            }
        },
        '/api/streams/{id}': {
            get: {
                tags: ['Streams'],
                summary: 'Get a stream by ID',
                parameters: [{ $ref: '#/components/parameters/Id' }],
                responses: {
                    200: { description: 'Stream' },
                    404: { $ref: '#/components/responses/NotFound' },
                    500: { $ref: '#/components/responses/ServerError' }
                }
            }
        },
        '/api/streams/{id}/hls': {
            get: {
                tags: ['Streams'],
                summary: 'Get the HLS playlist URL for a stream',
                parameters: [{ $ref: '#/components/parameters/Id' }],
                responses: { 200: { description: 'HLS URL' } }
            }
        },
        '/api/users/{id}': {
            get: {
                tags: ['Users'],
                summary: 'Get a user by ID',
                parameters: [{ $ref: '#/components/parameters/Id' }],
                responses: {
                    200: { description: 'User' },
                    404: { $ref: '#/components/responses/NotFound' },
                    500: { $ref: '#/components/responses/ServerError' }
                }
            }
        },
        '/api/users': {
            post: {
                tags: ['Users'],
                summary: 'Create a user',
                requestBody: {
                    required: true,
                    content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateUserRequest' } } }
                },
                responses: {
                    201: { description: 'Created user ID' },
                    400: { $ref: '#/components/responses/BadRequest' },
                    500: { $ref: '#/components/responses/ServerError' }
                }
            }
        },
        '/api/twitch/top-categories': {
            get: {
                tags: ['Twitch'],
                summary: 'Get top Twitch categories',
                parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', default: 30, minimum: 1 } }],
                responses: {
                    200: { description: 'Twitch categories' },
                    500: { $ref: '#/components/responses/ServerError' }
                }
            }
        },
        '/ffmpeg/register': {
            post: {
                tags: ['FFmpeg'],
                summary: 'Register a stream and create an SRT listener',
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterStreamRequest' } } } },
                responses: {
                    200: { description: 'Stream registered' },
                    400: { $ref: '#/components/responses/BadRequest' },
                    409: { description: 'Stream ID already registered' }
                }
            }
        },
        '/ffmpeg/stop': {
            post: {
                tags: ['FFmpeg'],
                summary: 'Stop an FFmpeg stream',
                requestBody: { required: true, content: { 'application/json': { schema: { $ref: '#/components/schemas/StopStreamRequest' } } } },
                responses: {
                    200: { description: 'Stop result' },
                    400: { $ref: '#/components/responses/BadRequest' },
                    500: { $ref: '#/components/responses/ServerError' }
                }
            }
        },
        '/ffmpeg/status': {
            get: {
                tags: ['FFmpeg'],
                summary: 'Get FFmpeg status for all or one stream',
                parameters: [{ name: 'streamId', in: 'query', schema: { type: 'string' } }],
                responses: { 200: { description: 'FFmpeg status' } }
            }
        },
        '/api/hls/{streamId}/{trackId}/playlist.m3u8': {
            get: {
                tags: ['Streams'],
                summary: 'Fetch an HLS playlist',
                parameters: [
                    { name: 'streamId', in: 'path', required: true, schema: { type: 'string' } },
                    { name: 'trackId', in: 'path', required: true, schema: { type: 'string' } }
                ],
                responses: { 200: { description: 'HLS playlist' }, 404: { $ref: '#/components/responses/NotFound' } }
            }
        }
    },
    components: {
        parameters: {
            Id: { name: 'id', in: 'path', required: true, schema: { type: 'string' } }
        },
        schemas: {
            Error: errorResponse,
            CreateUserRequest: {
                type: 'object',
                required: ['username'],
                properties: { username: { type: 'string' }, display_name: { type: 'string' } }
            },
            RegisterStreamRequest: {
                type: 'object',
                required: ['tracks', 'audioTracks'],
                properties: { tracks: { type: 'integer', minimum: 1 }, audioTracks: { type: 'integer', minimum: 1 }, streamId: { type: 'string' } }
            },
            StopStreamRequest: {
                type: 'object',
                required: ['streamId'],
                properties: { streamId: { type: 'string' } }
            }
        },
        responses: {
            BadRequest: { description: 'Invalid request', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            NotFound: { description: 'Resource not found', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } },
            ServerError: { description: 'Internal server error', content: { 'application/json': { schema: { $ref: '#/components/schemas/Error' } } } }
        }
    }
};

export default swaggerDocument;