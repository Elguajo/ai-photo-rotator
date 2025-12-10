# AI Object Rotator

Generate multi-view perspectives of objects using Google Gemini models.

## Local Development Setup

If you are running this project locally, you must configure your API key.

1.  **Get an API Key**
    Obtain a Gemini API key from [Google AI Studio](https://aistudio.google.com/).

2.  **Configure Environment**
    Create a file named `.env` in the root directory of the project.
    Add your API key to the file:

    ```env
    API_KEY=your_actual_api_key_here
    ```

    *Note: Ensure you do not commit your `.env` file to version control.*

3.  **Run the App**
    Start the development server (e.g., using `npm start`, `vite`, or your preferred bundler).

## Troubleshooting

- **Error: "API_KEY environment variable is not set"**
  This means the app cannot find the `API_KEY`. Double-check that your `.env` file exists in the root directory and contains the correct key format. Restart your development server after creating the file.
