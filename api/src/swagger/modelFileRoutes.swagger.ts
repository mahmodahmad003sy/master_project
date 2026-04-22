/**
 * @openapi
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @openapi
 * /model-files:
 *   get:
 *     summary: List ModelFiles with filtering & pagination
 *     description: Retrieve a paginated list of ModelFiles, optionally filtered by filename, model ID, user ID, or upload date.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: search
 *         in: query
 *         schema:
 *           type: string
 *         description: Substring match on filename
 *       - name: modelId
 *         in: query
 *         schema:
 *           type: integer
 *         description: Exact match on Model ID
 *       - name: userId
 *         in: query
 *         schema:
 *           type: integer
 *         description: Exact match on User ID
 *       - name: dateFrom
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *         description: Earliest upload date (inclusive), e.g. "2025-07-01"
 *       - name: dateTo
 *         in: query
 *         schema:
 *           type: string
 *           format: date
 *         description: Latest upload date (inclusive), e.g. "2025-07-31"
 *       - name: limit
 *         in: query
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of records to return
 *       - name: offset
 *         in: query
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Number of records to skip
 *     responses:
 *       '200':
 *         description: A paginated list of ModelFiles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 total:
 *                   type: integer
 *                 items:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: integer
 *                       filename:
 *                         type: string
 *                       filePath:
 *                         type: string
 *                       uploadedAt:
 *                         type: string
 *                         format: date-time
 *                       model:
 *                         type: object
 *                         description: Associated Model
 *                       user:
 *                         type: object
 *                         nullable: true
 *                         description: Uploader User
 *                       testRuns:
 *                         type: array
 *                         items:
 *                           type: object
 *                         description: Array of associated TestRuns
 *       '400':
 *         description: Invalid query parameters
 *       '401':
 *         description: Unauthorized – missing or invalid token
 *       '500':
 *         description: Server error
 */

/**
 * @openapi
 * /model-files/{id}:
 *   get:
 *     summary: Get a single ModelFile by ID
 *     description: Retrieve detailed information for a specific ModelFile, including its Model, User, and TestRuns.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: id
 *         in: path
 *         required: true
 *         schema:
 *           type: integer
 *         description: Numeric ID of the ModelFile to retrieve
 *     responses:
 *       '200':
 *         description: A single ModelFile object
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: integer
 *                 filename:
 *                   type: string
 *                 filePath:
 *                   type: string
 *                 uploadedAt:
 *                   type: string
 *                   format: date-time
 *                 model:
 *                   type: object
 *                   description: Associated Model
 *                 user:
 *                   type: object
 *                   nullable: true
 *                   description: Uploader User
 *                 testRuns:
 *                   type: array
 *                   items:
 *                     type: object
 *                   description: Array of associated TestRuns
 *       '401':
 *         description: Unauthorized – missing or invalid token
 *       '404':
 *         description: ModelFile not found
 *       '500':
 *         description: Server error
 */
