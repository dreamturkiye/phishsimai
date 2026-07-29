import { neon } from '@neondatabase/serverless'
import fs from 'fs'
const env = fs.readFileSync('/Users/kaan/phishsimai/.env.spring-leaf.real','utf8')
const sql = neon(env.match(/^DATABASE_URL=(.*)$/m)[1].replace(/^["']|["']$/g,''))
console.log(JSON.stringify(await sql.query(process.argv[2]), null, 1))
