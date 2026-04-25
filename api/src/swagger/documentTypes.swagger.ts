/**
 * @openapi
 * components:
 *   schemas:
 *     DocumentTypeInput:
 *       type: object
 *       required:
 *         - key
 *         - name
 *         - schema
 *       properties:
 *         key:
 *           type: string
 *           example: receipt
 *         name:
 *           type: string
 *           example: Receipt
 *         schema:
 *           type: object
 *           example:
 *             fields:
 *               - key: DATE
 *                 type: date
 *             arrays:
 *               - key: ORDER
 *                 fields:
 *                   - key: NAME
 *                     type: text
 *         fieldConfig:
 *           type: object
 *           nullable: true
 *         detectorConfig:
 *           type: object
 *           nullable: true
 *           properties:
 *             classMap:
 *               type: object
 *               additionalProperties:
 *                 type: string
 *             labelRoles:
 *               type: object
 *               additionalProperties:
 *                 type: string
 *             groupingRules:
 *               type: object
 *               nullable: true
 *         promptTemplate:
 *           type: string
 *           nullable: true
 *         modelId:
 *           type: integer
 *           nullable: true
 *     DocumentType:
 *       allOf:
 *         - $ref: '#/components/schemas/DocumentTypeInput'
 *         - type: object
 *           properties:
 *             id:
 *               type: integer
 *             status:
 *               type: string
 *               enum: [draft, active, archived]
 *             version:
 *               type: integer
 *             detectorModelId:
 *               type: integer
 *               nullable: true
 *             createdAt:
 *               type: string
 *               format: date-time
 *             updatedAt:
 *               type: string
 *               format: date-time
 *
 * /document-types:
 *   get:
 *     summary: List document types
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Array of document types
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/DocumentType'
 *   post:
 *     summary: Create a document type
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DocumentTypeInput'
 *     responses:
 *       '201':
 *         description: Created document type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocumentType'
 *
 * /document-types/{id}:
 *   get:
 *     summary: Get one document type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: Document type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocumentType'
 *       '404':
 *         description: Not found
 *   put:
 *     summary: Update a document type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/DocumentTypeInput'
 *     responses:
 *       '200':
 *         description: Updated document type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocumentType'
 *       '404':
 *         description: Not found
 *
 * /document-types/{id}/models:
 *   get:
 *     summary: List models bound to a document type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
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
 * /document-types/{id}/activate:
 *   post:
 *     summary: Activate a document type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       '200':
 *         description: Activated document type
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocumentType'
 *       '400':
 *         description: Activation preconditions failed
 *       '404':
 *         description: Not found
 *
 * /document-types/{id}/detector-model:
 *   post:
 *     summary: Attach a detector model to a document type
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - modelId
 *             properties:
 *               modelId:
 *                 type: integer
 *     responses:
 *       '200':
 *         description: Document type with attached detector
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/DocumentType'
 *       '404':
 *         description: Document type or model not found
 *       '409':
 *         description: Model is already attached elsewhere
 */
