"use server";

import { db } from "@/lib/prisma";
import { auth } from "@clerk/nextjs/server";
import { revalidatePath } from "next/cache";

const CREDIT_VALUE = 10; 
const PLATFORM_FEE_PER_CREDIT = 2; 
const ADVISOR_EARNINGS_PER_CREDIT = 8; 


export async function requestPayout(formData) {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const advisor = await db.user.findUnique({
      where: {
        clerkUserId: userId,
        role: "ADVISOR",
      },
    });

    if (!advisor) {
      throw new Error("Advisor not found");
    }

    const paypalEmail = formData.get("paypalEmail");

    if (!paypalEmail) {
      throw new Error("PayPal email is required");
    }

    
    const existingPendingPayout = await db.payout.findFirst({
      where: {
        advisorId: advisor.id,
        status: "PROCESSING",
      },
    });

    if (existingPendingPayout) {
      throw new Error(
        "You already have a pending payout request. Please wait for it to be processed."
      );
    }

    
    const creditCount = advisor.credits;

    if (creditCount === 0) {
      throw new Error("No credits available for payout");
    }

    if (creditCount < 1) {
      throw new Error("Minimum 1 credit required for payout");
    }

    const totalAmount = creditCount * CREDIT_VALUE;
    const platformFee = creditCount * PLATFORM_FEE_PER_CREDIT;
    const netAmount = creditCount * ADVISOR_EARNINGS_PER_CREDIT;

    
    const payout = await db.payout.create({
      data: {
        advisorId: advisor.id,
        amount: totalAmount,
        credits: creditCount,
        platformFee,
        netAmount,
        paypalEmail,
        status: "PROCESSING",
      },
    });

    revalidatePath("/advisor");
    return { success: true, payout };
  } catch (error) {
    console.error("Failed to request payout:", error);
    throw new Error("Failed to request payout: " + error.message);
  }
}

export async function getAdvisorPayouts() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const advisor = await db.user.findUnique({
      where: {
        clerkUserId: userId,
        role: "ADVISOR",
      },
    });

    if (!advisor) {
      throw new Error("Advisor not found");
    }

    const payouts = await db.payout.findMany({
      where: {
        advisorId: advisor.id,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { payouts };
  } catch (error) {
    throw new Error("Failed to fetch payouts: " + error.message);
  }
}


export async function getAdvisorEarnings() {
  const { userId } = await auth();

  if (!userId) {
    throw new Error("Unauthorized");
  }

  try {
    const advisor = await db.user.findUnique({
      where: {
        clerkUserId: userId,
        role: "ADVISOR",
      },
    });

    if (!advisor) {
      throw new Error("Advisor not found");
    }

    
    const completedAppointments = await db.appointment.findMany({
      where: {
        advisorId: advisor.id,
        status: "COMPLETED",
      },
    });

    
    const currentMonth = new Date();
    currentMonth.setDate(1);
    currentMonth.setHours(0, 0, 0, 0);

    const thisMonthAppointments = completedAppointments.filter(
      (appointment) => new Date(appointment.createdAt) >= currentMonth
    );

    
    const totalEarnings = advisor.credits * ADVISOR_EARNINGS_PER_CREDIT; 

    
    const thisMonthEarnings =
      thisMonthAppointments.length * 2 * ADVISOR_EARNINGS_PER_CREDIT;

    
    const averageEarningsPerMonth =
      totalEarnings > 0
        ? totalEarnings / Math.max(1, new Date().getMonth() + 1)
        : 0;

    
    const availableCredits = advisor.credits;
    const availablePayout = availableCredits * ADVISOR_EARNINGS_PER_CREDIT;

    return {
      earnings: {
        totalEarnings,
        thisMonthEarnings,
        completedAppointments: completedAppointments.length,
        averageEarningsPerMonth,
        availableCredits,
        availablePayout,
      },
    };
  } catch (error) {
    throw new Error("Failed to fetch advisor earnings: " + error.message);
  }
}
