/**
 * @openapi
 * components:
 *   parameters:
 *     DatasetId:
 *       name: datasetId
 *       in: path
 *       required: true
 *       schema:
 *         type: integer
 *         example: 2
 *   schemas:
 *     ModelFile:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           example: 3
 *         datasetId:
 *           type: integer
 *           example: 2
 *         filename:
 *           type: string
 *           example: best.pt
 *         uploadedAt:
 *           type: string
 *           format: date-time
 *           example: '2025-07-24T14:40:00Z'
 *
 *
 */
