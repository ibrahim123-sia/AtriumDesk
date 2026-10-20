import express from 'express'
import {
  registerUser,
  verifyOtp,
  resentOtp,
  forgetPassword,
  resetPassword,
  loginUser,
  getUser,
  updateProfile,
  updateProfileDetails,
  parseCv,
  changePassword,
  otpLimiter,
  otpPerAddressLimiter,
  codeCheckLimiter,
  loginLimiter,
  unsubscribeFromDigest,
} from '../controllers/userController.js'
import { exportMyData, deleteMyAccount, deleteAccountLimiter } from '../controllers/accountDataController.js'
import { protect } from '../middlewares/auth.js'
import { avatarUpload, cvUpload, handleUploadError } from '../middlewares/upload.js'

const userRouter = express.Router()

// Every route that emails a code is limited per network (otpLimiter) and
// per address (otpPerAddressLimiter); the controllers add a one-minute
// cooldown per account.
userRouter.post('/resend-otp', otpLimiter, otpPerAddressLimiter, resentOtp)
userRouter.post('/forgot-password', otpLimiter, otpPerAddressLimiter, forgetPassword)

// Public routes
// registerUser sends an OTP email on every call for a new/unverified
// address, same as resend-otp/forgot-password above — without this it was
// the one OTP-sending endpoint with no platform-side throttle, letting an
// attacker email-bomb arbitrary addresses or exhaust a tenant's SMTP quota.
userRouter.post('/register', otpLimiter, otpPerAddressLimiter, registerUser)
// Code checks: each account locks its code after 5 wrong tries; this caps
// guessing across accounts from one network.
userRouter.post('/verify-otp', codeCheckLimiter, verifyOtp)
userRouter.post('/reset-password', codeCheckLimiter, resetPassword)
userRouter.post('/login', loginLimiter, loginUser)
userRouter.get('/unsubscribe', unsubscribeFromDigest)

// Protected routes
userRouter.get('/get', protect, getUser)
userRouter.patch(
  '/profile',
  protect,
  avatarUpload.single('avatar'),
  handleUploadError,
  updateProfile
)
userRouter.patch('/profile/details', protect, updateProfileDetails)
userRouter.post('/cv/parse', protect, cvUpload.single('cv'), handleUploadError, parseCv)
userRouter.post('/change-password', protect, changePassword)
// Rev 5 §13.3 — download my data / delete my account
userRouter.get('/me/export', protect, exportMyData)
userRouter.post('/me/delete', protect, deleteAccountLimiter, deleteMyAccount)

export default userRouter