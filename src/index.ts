import { MCPServer } from "mcp-framework";

const server = new MCPServer();

// Tools are auto-discovered from src/tools/ directory
// YandexSearchTool will be loaded automatically

server.start();
