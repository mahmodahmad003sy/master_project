/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *
 * /detect:
 *   post:
 *     summary: Run inference on an image using one or more models
 *     description: Provide a single image and a comma-separated list of model IDs to perform detection using each model. You can also override per-model `cocoClasses`, `displayConfig`, and set OCR languages.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: ids
 *         in: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Comma-separated list of model IDs (e.g. "1,2,3")
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
 *                 description: Image file to analyze
 
 *     responses:
 *       '200':
 *         description: Array of results per model
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       modelId:
 *                         type: integer
 *                       result:
 *                         type: object
 *                         nullable: true
 *                         description: Detection output for the model (if successful)
 *                       error:
 *                         type: string
 *                         nullable: true
 *                         description: Error message (if model not found or detection failed)
 *       '400':
 *         description: Validation error (e.g. no file, invalid model ID list, or bad JSON)
 *       '401':
 *         description: Unauthorized – missing or invalid token
 */
