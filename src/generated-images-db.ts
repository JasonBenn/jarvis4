const BACKEND_URL = process.env.JARVIS4_PORT
  ? `http://127.0.0.1:${process.env.JARVIS4_PORT}`
  : 'http://127.0.0.1:3456';

export interface GeneratedImage {
  id: string;
  entryHash: string;
  imageUrl: string;
  documentId: string | null;
  createdAt: string;
}

// Client-side logger (simple console wrapper with structured format)
const clientLogger = {
  error: (context: Record<string, any>, message: string) => {
    console.error(`[ERROR] ${message}`, context);
  },
  info: (context: Record<string, any>, message: string) => {
    console.log(`[INFO] ${message}`, context);
  },
};

export const generatedImages = {
  async findByEntryHash(entryHash: string): Promise<GeneratedImage | undefined> {
    try {
      const response = await fetch(`${BACKEND_URL}/generated-images/${entryHash}`);
      if (response.status === 404) {
        return undefined;
      }
      if (!response.ok) {
        throw new Error(`Failed to fetch image: ${response.statusText}`);
      }
      return await response.json();
    } catch (error) {
      clientLogger.error(
        {
          type: 'image_fetch_error',
          entryHash,
          error: {
            name: (error as Error).name,
            message: (error as Error).message,
          },
        },
        `Error fetching image ${entryHash}: ${(error as Error).message}`
      );
      return undefined;
    }
  },

  async create(entryHash: string, imageUrl: string): Promise<GeneratedImage> {
    try {
      const response = await fetch(`${BACKEND_URL}/generated-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entryHash, imageUrl }),
      });
      if (!response.ok) {
        throw new Error(`Failed to create image: ${response.statusText}`);
      }
      const result = await response.json();
      clientLogger.info(
        {
          type: 'image_created',
          entryHash,
          imageUrl,
        },
        `Created image for entry ${entryHash}`
      );
      return result;
    } catch (error) {
      clientLogger.error(
        {
          type: 'image_create_error',
          entryHash,
          imageUrl,
          error: {
            name: (error as Error).name,
            message: (error as Error).message,
          },
        },
        `Error creating image for ${entryHash}: ${(error as Error).message}`
      );
      throw error;
    }
  },

  async updateDocumentId(entryHash: string, documentId: string): Promise<void> {
    try {
      const response = await fetch(`${BACKEND_URL}/generated-images/${entryHash}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      });
      if (!response.ok) {
        throw new Error(`Failed to update document ID: ${response.statusText}`);
      }
      clientLogger.info(
        {
          type: 'image_document_updated',
          entryHash,
          documentId,
        },
        `Updated document ID for image ${entryHash}`
      );
    } catch (error) {
      clientLogger.error(
        {
          type: 'image_update_error',
          entryHash,
          documentId,
          error: {
            name: (error as Error).name,
            message: (error as Error).message,
          },
        },
        `Error updating document ID for ${entryHash}: ${(error as Error).message}`
      );
      throw error;
    }
  },
};
