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
 *           example: receipt-yolov11-v1
 *         type:
 *           type: string
 *           example: yolo
 *         family:
 *           type: string
 *           example: yolo
 *         classesCount:
 *           type: integer
 *           example: 8
 *         classMap:
 *           type: object
 *           description: Canonical field labels keyed by detector class ID
 *           additionalProperties:
 *             type: string
 *           example:
 *             "0": "DATE"
 *             "1": "FB"
 *             "2": "FD"
 *             "3": "SUM"
 *             "4": "ORDER"
 *         inputImageSize:
 *           type: integer
 *           nullable: true
 *           example: 1280
 *         confidenceDefaults:
 *           type: object
 *           nullable: true
 *           properties:
 *             default:
 *               type: number
 *             perClass:
 *               type: object
 *               additionalProperties:
 *                 type: number
 *         documentTypeId:
 *           type: integer
 *           nullable: true
 *           example: 1
 *         status:
 *           type: string
 *           enum: [uploaded, validated, active, archived]
 *           example: uploaded
 *         version:
 *           type: integer
 *           example: 1
 *         notes:
 *           type: string
 *           nullable: true
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
 *             filePath:
 *               type: string
 *               nullable: true
 *               example: D:/Master/service/api/tmp/receipt-yolov11-v1/weights/model.pt
 *             sha256:
 *               type: string
 *               nullable: true
 *               example: 38c4e4e8ef4b0fb0ac8aaf9f53d9e6e1bb6a88960519de4d6e1d8d72879f5d19
 *             fileSize:
 *               type: integer
 *               nullable: true
 *               example: 104857600
 *             createdAt:
 *               type: string
 *               format: date-time
 *               example: '2025-07-24T14:30:00Z'
 *             updatedAt:
 *               type: string
 *               format: date-time
 *               example: '2025-07-24T15:00:00Z'
 *
 *     ActiveModel:
 *       type: object
 *       properties:
 *         modelId:
 *           type: integer
 *           example: 1
 *         modelVersion:
 *           type: integer
 *           example: 1
 *         documentTypeKey:
 *           type: string
 *           example: receipt
 *         documentTypeVersion:
 *           type: integer
 *           example: 1
 *         sha256:
 *           type: string
 *           example: 38c4e4e8ef4b0fb0ac8aaf9f53d9e6e1bb6a88960519de4d6e1d8d72879f5d19
 *         fileSize:
 *           type: integer
 *           nullable: true
 *           example: 104857600
 *         downloadUrl:
 *           type: string
 *           example: https://example.ngrok-free.app/api/models/1/download
 *         classMap:
 *           type: object
 *           additionalProperties:
 *             type: string
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
 * /models/{modelId}:
 *   put:
 *     summary: Update model metadata
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: modelId
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ModelInput'
 *     responses:
 *       '200':
 *         description: Updated model
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Model'
 *       '404':
 *         description: Model not found
 *   delete:
 *     summary: Delete a model
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: modelId
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '204':
 *         description: Model deleted
 *       '404':
 *         description: Model not found
 *       '409':
 *         description: Active models cannot be deleted
 *
 * /models/{modelId}/file:
 *   post:
 *     summary: Upload a detector weights file for a model
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
 *                 description: The .pt detector weights file to upload
 *     responses:
 *       '200':
 *         description: Model record updated with filePath, sha256, and fileSize
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Model'
 *       '400':
 *         description: No file was uploaded or the file is not a .pt
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
 *
 * /models/{modelId}/validate:
 *   post:
 *     summary: Validate a detector model's file and class map
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: modelId
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: Model validated
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Model'
 *       '400':
 *         description: Validation failed
 *       '404':
 *         description: Model not found
 *
 * /models/active:
 *   get:
 *     summary: List active detector models for Colab sync
 *     parameters:
 *       - name: X-Sync-Token
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Active models available for sync
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/ActiveModel'
 *       '401':
 *         description: Invalid or missing sync token
 *
 * /models/{modelId}/download:
 *   get:
 *     summary: Download a detector weights file for Colab sync
 *     parameters:
 *       - name: modelId
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *       - name: X-Sync-Token
 *         in: header
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Binary .pt file stream
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       '401':
 *         description: Invalid or missing sync token
 *       '404':
 *         description: Model file not found
 */
