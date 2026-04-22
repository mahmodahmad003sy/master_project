/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     ModelInput:
 *       type: object
 *       required: [name, type]
 *       properties:
 *         name:
 *           type: string
 *           example: yolo
 *         type:
 *           type: string
 *           example: YOLO
 *     Model:
 *       allOf:
 *         - $ref: '#/components/schemas/ModelInput'
 *         - type: object
 *           properties:
 *             id:
 *               type: integer
 *               example: 1
 *             createdAt:
 *               type: string
 *               format: date-time
 *               example: '2025-07-24T14:30:00Z'
 */
