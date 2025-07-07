
import { NextResponse, type NextRequest } from 'next/server';

export const runtime = 'nodejs';

const FLASK_SERVER_URL = process.env.NEXT_PUBLIC_FLASK_SERVER_URL;

export async function POST(request: NextRequest) {
    const reqId = Math.random().toString(36).substring(2, 9);
    console.log(`API /api/upload-image (Req ID: ${reqId}): POST request received, proxying to Flask.`);

    if (!FLASK_SERVER_URL) {
        console.error(`API /api/upload-image (Req ID: ${reqId}): Configuration Error - NEXT_PUBLIC_FLASK_SERVER_URL is not set.`);
        return NextResponse.json({ message: 'Server configuration error: Flask server URL not set.', errorKey: 'FLASK_URL_MISSING' }, { status: 500 });
    }

    try {
        const flaskEndpoint = `${FLASK_SERVER_URL}/api/upload-and-process`;
        
        // Stream the request body directly to the Flask server.
        // This avoids loading the entire file into memory on the Next.js server.
        const flaskResponse = await fetch(flaskEndpoint, {
            method: 'POST',
            body: request.body,
            headers: {
                // IMPORTANT: Pass through the Content-Type header from the original request.
                // It contains the multipart boundary needed by the Flask server to parse the form data.
                'Content-Type': request.headers.get('Content-Type')!,
            },
            // @ts-ignore - duplex is a valid option for Node.js fetch
            duplex: 'half'
        });

        // Proxy the response from the Flask server back to the original client.
        return new NextResponse(flaskResponse.body, {
            status: flaskResponse.status,
            statusText: flaskResponse.statusText,
            headers: flaskResponse.headers,
        });

    } catch (error: any) {
        console.error(`API /api/upload-image (Req ID: ${reqId}, proxy): Error forwarding request to Flask:`, error);
        return NextResponse.json({ message: 'Error communicating with the processing server.', error: error.message }, { status: 502 }); // 502 Bad Gateway
    }
}
