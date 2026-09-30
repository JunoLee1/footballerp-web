//import router from "../apiRouter"
import {Router}from "express"
import Controller from "./country.controller"
import Service from "./country.service"
import Repository from "./country.repo"
import {getPrisma} from "../lib/prisma"
import { CountryApiClient} from "../externalAPI"
import { intIdRouter } from "../lib/idParamGuard";

const router = intIdRouter()
const client = new CountryApiClient()
const prisma = getPrisma()
const repo = new Repository(prisma)
const service = new Service(client,repo)
const controller = new Controller(service)
router.get(
    "/:code",
    controller.getCountry
)
router.get(
    "/",
    controller.getCountries
)
export default router