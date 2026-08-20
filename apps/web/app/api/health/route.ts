export async function GET() {
  return Response.json({ status: "ok", service: "apfiscal-web", timestamp: new Date().toISOString() });
}
