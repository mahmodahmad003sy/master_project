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
 *       required:
 *         - name
 *         - type
 *       properties:
 *         name:
 *           type: string
 *           example: yolo
 *         type:
 *           type: string
 *           example: YOLO
 *         cocoClasses:
 *           type: object
 *           description: JSON map of class IDs to labels
 *           additionalProperties:
 *             type: string
 *           example:
 *             "0": "DATE"
 *             "1": "FB"
 *             "2": "FD"
 *             "3": "ORDER"
 *             "4": "SUM"
 *         displayConfig:
 *           type: object
 *           description: JSON map of class IDs to display settings
 *           additionalProperties:
 *             type: object
 *             properties:
 *               multiple:
 *                 type: boolean
 *               threshold:
 *                 type: number
 *                 nullable: true
 *             required:
 *               - multiple
 *               - threshold
 *           example:
 *             "0":
 *               multiple: false
 *               threshold: 0.0
 *             "3":
 *               multiple: true
 *               threshold: 0.5
 *         languages:
 *           type: array
 *           description: List of Tesseract OCR language codes
 *           items:
 *             type: string
 *           example:
 *             - rus
 *             - eng
 *
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
 *
 * /models:
 *   post:
 *     summary: Create a new model
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ModelInput'
 *     responses:
 *       '201':
 *         description: Created model
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Model'
 *   get:
 *     summary: List all models
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Array of models
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Model'
 *
 * /models/{modelId}/file:
 *   post:
 *     summary: Upload a file for a model
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: modelId
 *         in: path
 *         description: ID of the model to attach the file to
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The model file to upload
 *     responses:
 *       '200':
 *         description: Model record updated with filePath
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Model'
 *       '400':
 *         description: No file was uploaded
 *       '404':
 *         description: Model not found
 *
 * /models/{modelId}/dataset:
 *   post:
 *     summary: Upload a dataset archive for a model
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: modelId
 *         in: path
 *         description: ID of the model
 *         required: true
 *         schema:
 *           type: integer
 *           example: 1
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: The .rar file containing your dataset
 *     responses:
 *       '200':
 *         description: Dataset file stored successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 datasetPath:
 *                   type: string
 *                   example: C:/and/wher/eid/dataset/mydata.rar
 *       '400':
 *         description: No file was uploaded
 *       '404':
 *         description: Model not found
 */
