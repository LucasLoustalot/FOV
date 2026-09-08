import swaggerDocument from '../swagger.js';

describe('Swagger document', () => {
    test('describes the public API and shared schemas', () => {
        expect(swaggerDocument.openapi).toBe('3.0.3');
        expect(swaggerDocument.info.title).toBe('FOV Backend API');
        expect(swaggerDocument.paths['/api']).toBeDefined();
        expect(swaggerDocument.paths['/api/streams/available'].get).toBeDefined();
        expect(swaggerDocument.paths['/api/twitch/top-categories'].get).toBeDefined();
        expect(swaggerDocument.components.parameters.Id).toEqual({
            name: 'id',
            in: 'path',
            required: true,
            schema: { type: 'string' }
        });
        expect(swaggerDocument.components.schemas.CreateUserRequest.required).toEqual(['username']);
        expect(swaggerDocument.components.responses.ServerError).toBeDefined();
    });
});
