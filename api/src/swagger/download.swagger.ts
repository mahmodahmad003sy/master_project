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
 * /download/{filename}:
 *   get:
 *     summary: Download a previously uploaded file by filename
 *     description: Streams the stored file associated with the given original filename as an attachment.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: filename
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: The original filename of the stored file (e.g. "image.jpg")
 *     responses:
 *       '200':
 *         description: The requested file as a binary attachment
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       '401':
 *         description: Unauthorized – missing or invalid token
 *       '404':
 *         description: File not found
 *       '500':
 *         description: Internal server error
 */
