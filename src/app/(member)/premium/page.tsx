import { createClient } from "@/lib/supabase/server";
import { loadSebPayFoundationConfig } from "@/lib/server/sebpay";
import { PremiumExperience } from "@/components/member/premium-experience";
import styles from "./premium-page.module.css";

/**
 * Phase 4 : le flag `paymentsOpen` est calculé côté serveur uniquement
 * (drapeaux non secrets de la fondation SebPay). Configuration absente ou
 * invalide = fermé — la page reste identique à l'existant.
 */
function readPaymentFlags(): { paymentsOpen: boolean; pilotMode: boolean } {
  try {
    const config = loadSebPayFoundationConfig();

    return { paymentsOpen: config.enabled, pilotMode: config.pilotMode };
  } catch {
    // Configuration absente ou invalide = fermé, comme avant.
    return { paymentsOpen: false, pilotMode: false };
  }
}

export default async function PremiumPage() {
  const { paymentsOpen, pilotMode } = readPaymentFlags();
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let firstName: string | null = null;
  let gender: string | null = null;
  let religion: string | null = null;

  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("first_name, gender, religion")
      .eq("id", user.id)
      .single();

    if (data) {
      firstName = data.first_name;
      gender = data.gender;
      religion = data.religion;
    }
  }

  return (
    <div className={styles.compactPremium}>
      <PremiumExperience
        firstName={firstName}
        gender={gender as Parameters<typeof PremiumExperience>[0]["gender"]}
        religion={
          religion as Parameters<typeof PremiumExperience>[0]["religion"]
        }
        paymentsOpen={paymentsOpen}
        pilotMode={pilotMode}
      />
    </div>
  );
}
