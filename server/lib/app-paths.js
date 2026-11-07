import { join } from 'node:path'
export const dataDirectory=process.env.WORKBENCH_DATA_DIR||join(import.meta.dirname,'../data')
export const writablePublic=process.env.WORKBENCH_DATA_DIR?join(dataDirectory,'public'):join(import.meta.dirname,'../../public')
