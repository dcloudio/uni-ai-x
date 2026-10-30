import { getRealPath } from '@dcloudio/uni-app-x-vapor-runtime'

export function realHarmonyAssetPath(path: string): string {
	const resolved = getRealPath(path) as string
	const local = resolved.startsWith('file://') ? resolved.substring(7) : resolved
	return local.replace(/\/+/g, '/')
}
