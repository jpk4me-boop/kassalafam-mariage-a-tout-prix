import { createClient } from "@/lib/supabase/server";
import { PremiumExperience } from "@/components/member/premium-experience";
import styles from "./premium-page.module.css";

export default async function PremiumPage() {
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
      />
    </div>
  );
}
