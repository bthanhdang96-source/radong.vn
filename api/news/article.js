import articleHandler from './articles/[slug].js'

export default async function handler(req, res) {
  return articleHandler(req, res)
}
