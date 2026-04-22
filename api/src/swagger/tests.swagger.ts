/**
 * @openapi
 * components:
 *   schemas:
 *     TestRunInput:
 *       type: object
 *       required: [modelFileId]
 *       properties:
 *         modelFileId:
 *           type: integer
 *           example: 3
 *     TestRunResult:
 *       type: object
 *       properties:
 *         resultsPath:
 *           type: string
 *           example: ./outputs/yolo/3/1627132800000/
 *         metrics:
 *           type: object
 *           example:
 *             mAP: 0.75
 *             precision: 0.80
 *             recall: 0.70
 *
 * /test-runs:
 *   post:
 *     summary: Trigger a test run on a model file
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/TestRunInput'
 *     responses:
 *       '200':
 *         description: Test run results
 *       '404':
 *         description: Model file not found
 */
