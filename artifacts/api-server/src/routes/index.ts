import { Router, type IRouter } from "express";
import healthRouter from "./health";
import shippingRouter from "./shipping";

const router: IRouter = Router();

router.use(healthRouter);
router.use(shippingRouter);

export default router;
