import { neon } from '@neondatabase/serverless'
import fs from 'fs'
const raw = fs.readFileSync('/Users/kaan/phishsimai/.env.spring-leaf.real','utf8')
const url = raw.match(/^DATABASE_URL(?:_UNPOOLED)?=(.+)$/m)[1].trim().replace(/^["']|["']$/g,'')
if(!/ep-spring-leaf/.test(url)) throw new Error('WRONG HOST')
export const sql = neon(url)
export const j = (x) => console.log(JSON.stringify(x,null,1))
