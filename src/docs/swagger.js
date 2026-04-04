import swaggerUi from 'swagger-ui-express';
import yaml from 'yamljs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load YAML swagger spec
const swaggerDocument = yaml.load(path.join(__dirname, 'swagger.yaml'));

/**
 * Configure Swagger UI and attach it to an Express app
 */
export function setupSwagger(app) {
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
    customSiteTitle: 'Finance Dashboard API Docs',
  }));
}
