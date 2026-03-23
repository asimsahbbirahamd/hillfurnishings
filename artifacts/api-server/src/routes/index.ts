import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shippingRouter from "./shipping";
import shopifyAuthRouter from "./shopify-auth";

const router: IRouter = Router();

router.use(healthRouter);
router.use(shopifyAuthRouter);
router.use(shippingRouter);

export default router;
