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
      console.error('Error fetching image:', error);
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
      return await response.json();
    } catch (error) {
      console.error('Error creating image:', error);
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
    } catch (error) {
      console.error('Error updating document ID:', error);
      throw error;
    }
  },
};
