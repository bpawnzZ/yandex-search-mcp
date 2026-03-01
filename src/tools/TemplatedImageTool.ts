import { MCPTool } from "mcp-framework";
import { ImageContent } from "mcp-framework/dist/transports/utils/image-handler.js";
import { z } from "zod";

interface ImageGenInput {
  templateId: string;
  photoBgImageUrl: string;
  bgYellowImageUrl: string;
  buildText: string;
}

class TemplatedImageTool extends MCPTool<ImageGenInput> {
  name = "templated-image-generator";
  description = "Generates an image using Templated.io with a given template and dynamic assets. This returns a base64 image that should be displayed in the client";

  schema = {
    templateId: {
      type: z.string(),
      description: "The Templated.io template ID to use."
    },
    photoBgImageUrl: {
      type: z.string().url(),
      description: "URL for the image to place in the 'photo-bg' layer."
    },
    bgYellowImageUrl: {
      type: z.string().url(),
      description: "URL for the image to place in the 'bg-yellow' layer."
    },
    buildText: {
      type: z.string(),
      description: "Text content for the 'build' text layer."
    }
  };

  public async execute(params: {
    templateId: string;
    photoBgImageUrl: string;
    bgYellowImageUrl: string;
    buildText: string;
  }): Promise<ImageContent> {
    const { templateId, photoBgImageUrl, bgYellowImageUrl, buildText } = params;

    const requestBody = {
      template: templateId,
      layers: {
        "photo-bg": {
          image_url: photoBgImageUrl
        },
        "bg-yellow": {
          image_url: bgYellowImageUrl
        },
        "build": {
          text: buildText,
          color: "rgb(0, 0, 0)"
        }
      }
    };

    const response = await fetch('https://api.templated.io/v1/render', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.TEMPLATED_API_KEY}` 
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Templated API request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    
    const imageResponse = await fetch(result.url);
    if (!imageResponse.ok) {
      throw new Error(`Failed to download image: ${imageResponse.status} ${imageResponse.statusText}`);
    }

    const imageBuffer = await imageResponse.arrayBuffer();
    const base64Image = Buffer.from(imageBuffer).toString('base64');

    return {
      type: "image",
      data: base64Image,
      mimeType: "image/jpeg" 
    };
  }
}

export default TemplatedImageTool;
