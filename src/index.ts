import { MCPServer } from "mcp-framework";

const server = new MCPServer();

// alt version: with sse :p
// const server = new MCPServer({transport:{type:"sse",options:{port:1337}}});

server.start();
