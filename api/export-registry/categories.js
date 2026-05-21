import { fetchBackendJson } from '../_shared.js'

export default async function handler(_req, res) {
  try {
    const json = await fetchBackendJson('/api/export-registry/categories')
    res.status(200).json(json)
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to load export registry categories',
    })
  }
}
