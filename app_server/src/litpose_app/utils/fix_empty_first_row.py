import numpy as np
import pandas as pd


def fix_empty_first_row(df: pd.DataFrame) -> pd.DataFrame:
    """Copied from lightning-pose utils. Fixes pandas issue where reading a dataframe with NaNs in first line omits it."""
    if df.index.name is not None:
        new_row = {col: np.nan for col in df.columns}
        prepend_df = pd.DataFrame(
            new_row, index=[df.index.name], columns=df.columns, dtype="float64"
        )
        fixed_df = pd.concat([prepend_df, df])
        assert fixed_df.index.name is None
        return fixed_df

    return df
