import swaggerJsdoc from 'swagger-jsdoc';

const options = {
    failOnErrors: true,

    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Kusala Backend API',
            version: '1.0.0',
            description: 'API documentation for the Kusala wellness platform backend.',
        },
//        servers: [
          //  {
        //        url: 'http://localhost:5000',
      //          description: 'Local Development Server',
    //        },
  //          {
             //   url: 'https://witch-edges-sir-functions.trycloudflare.com',
//                description: 'Active Cloudflare Tunnel Server',
           // },
///            {
//                url: 'https://aerial-workflow-sunshine-drop.trycloudflare.com',
//                description: 'Previous Tunnel Server',
//            },
//        ],

        // Apply BearerAuth globally so Swagger UI sends the token on every request
        security: [
            { BearerAuth: [] }
        ],

        // ── Swagger Section Order ───────────────────────────────────────
        tags: [
            {
                name: 'Auth',
                description: 'Authentication and session management',
            },
            {
                name: 'Users',
                description: 'Authenticated user profile and appointment management',
            },
            {
                name: 'Practitioners',
                description: 'Practitioner listing, admin management and self-service',
            },
            {
                name: 'Availability',
                description: 'Practitioner scheduling and available slot APIs',
            },
        ],

        components: {
            securitySchemes: {
                BearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Enter your access_token from the login or verifyOtp response.',
                },
            },
            schemas: {
                // ── Auth Request Bodies ──────────────────────────────────────────
                RegisterRequest: {
                    type: 'object',
                    required: ['email', 'password', 'name'],
                    properties: {
                        email: { type: 'string', format: 'email', example: 'john@example.com' },
                        password: { type: 'string', minLength: 6, example: 'SecurePassword123!' },
                        name: { type: 'string', example: 'John Doe' },
                        role: { type: 'string', enum: ['Customer', 'Practitioner', 'Admin'], default: 'Customer' },
                    },
                },
                LoginRequest: {
                    type: 'object',
                    required: ['email', 'password'],
                    properties: {
                        email: { type: 'string', format: 'email', example: 'john@example.com' },
                        password: { type: 'string', example: 'SecurePassword123!' },
                    },
                },
                SendOtpRequest: {
                    type: 'object',
                    required: ['identifier'],
                    properties: {
                        identifier: { type: 'string', format: 'email', example: 'john@example.com' },
                    },
                },
                VerifyOtpRequest: {
                    type: 'object',
                    required: ['identifier', 'otp'],
                    properties: {
                        identifier: { type: 'string', format: 'email', example: 'john@example.com' },
                        otp: { type: 'string', minLength: 6, maxLength: 6, example: '123456' },
                    },
                },

                // ── Response Shapes ──────────────────────────────────────────────
                UserProfile: {
                    type: 'object',
                    properties: {
                        id: { type: 'string', format: 'uuid' },
                        full_name: { type: 'string', nullable: true },
                        phone: { type: 'string', nullable: true },
                        practitioner_slug: { type: 'string', nullable: true },
                        referral_code: { type: 'string', nullable: true },
                        credit_inr: { type: 'number' },
                        role: { type: 'string', enum: ['client', 'practitioner', 'admin'] },
                    },
                },
                AuthResponse: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' },
                        user: {
                            type: 'object',
                            properties: {
                                id: { type: 'string', format: 'uuid' },
                                email: { type: 'string', format: 'email' },
                                profile: { $ref: '#/components/schemas/UserProfile', nullable: true },
                            },
                        },
                        session: {
                            type: 'object',
                            nullable: true,
                            properties: {
                                access_token: { type: 'string' },
                                refresh_token: { type: 'string' },
                                expires_in: { type: 'integer', example: 3600 },
                                token_type: { type: 'string', example: 'bearer' },
                            },
                        },
                    },
                },
                Pagination: {
                    type: 'object',
                    properties: {
                        page: { type: 'integer', example: 1 },
                        limit: { type: 'integer', example: 10 },
                        total: { type: 'integer', example: 45 },
                        totalPages: { type: 'integer', example: 5 },
                    },
                },
                ErrorResponse: {
                    type: 'object',
                    properties: {
                        error: { type: 'string', example: 'A user with this email address already exists.' },
                    },
                },
            },
        },
    },
    // Scan these files for JSDoc @swagger annotations
    apis: ['./src/routes/*.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
