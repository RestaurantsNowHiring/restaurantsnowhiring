import { handleEmployerJobAction } from "../actions";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return handleEmployerJobAction(request, context, "renew");
}
